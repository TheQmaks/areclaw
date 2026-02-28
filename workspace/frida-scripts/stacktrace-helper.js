/**
 * Stack Trace Helper — Cross-thread call chain tracing
 *
 * Problem: Java stack traces are lost when execution crosses thread boundaries
 * (new Thread, ExecutorService, AsyncTask, Coroutines, Handler.post).
 *
 * Solution: Hook thread creation points to capture and associate the PARENT
 * thread's stack trace with the CHILD thread's execution.
 *
 * Usage: frida -U -f <pkg> -l stacktrace-helper.js
 *
 * Modes:
 *   TRACE_THREAD_CREATION — log who creates threads and what they run
 *   TRACE_ASYNC           — trace ExecutorService, Handler, AsyncTask
 *   TRACE_COROUTINES      — trace Kotlin coroutine dispatchers
 *   LINK_PARENT_CHILD     — associate parent stack with child execution
 */

'use strict';

// ═══════════════════════════════════════════════
var TRACE_THREAD_CREATION = true;
var TRACE_ASYNC           = true;
var TRACE_COROUTINES      = true;
var LINK_PARENT_CHILD     = true;
var MAX_TRACKED_THREADS   = 500;
// ═══════════════════════════════════════════════

var TAG = '[StackTrace]';

// Storage for parent-child stack associations, keyed by unique tracking ID
var parentStacks = {};
var nextId = 1;
var trackedCount = 0;

function captureStack(depth) {
    depth = depth || 15;
    try {
        var Exception = Java.use('java.lang.Exception');
        var stack = Exception.$new().getStackTrace();
        var lines = [];
        for (var i = 0; i < Math.min(stack.length, depth); i++) {
            var frame = stack[i].toString();
            if (frame.indexOf('com.frida') !== -1) continue;
            lines.push('  at ' + frame);
        }
        return lines.join('\n');
    } catch (e) {
        return '  <stack capture failed: ' + e.message + '>';
    }
}

// Evict oldest entries when cache is full
function evictOldest() {
    if (trackedCount < MAX_TRACKED_THREADS) return;
    var oldestKey = null;
    var oldestTime = null;
    for (var key in parentStacks) {
        if (!oldestTime || parentStacks[key].created < oldestTime) {
            oldestTime = parentStacks[key].created;
            oldestKey = key;
        }
    }
    if (oldestKey) {
        delete parentStacks[oldestKey];
        trackedCount--;
    }
}

Java.perform(function () {

    // ═══════════════════════════════════════════════
    // 1. Thread creation — capture parent stack, log child
    // ═══════════════════════════════════════════════
    if (TRACE_THREAD_CREATION) {
        try {
            var Thread = Java.use('java.lang.Thread');

            // Hook Thread.start() — parent creates a new thread
            Thread.start.implementation = function () {
                var threadName = this.getName();
                var threadId = nextId++;
                // Use Java identity hash as unique key (stable per-object)
                var objId = Java.use('java.lang.System').identityHashCode(this);
                var trackKey = 'T' + objId;

                var parentStack = captureStack(20);
                console.log(TAG + ' ═══ Thread.start() ═══');
                console.log(TAG + ' Thread: "' + threadName + '" (tracking ID: ' + threadId + ', obj: ' + objId + ')');
                console.log(TAG + ' PARENT stack (creation site):');
                console.log(parentStack);

                if (LINK_PARENT_CHILD) {
                    evictOldest();
                    parentStacks[trackKey] = {
                        id: threadId,
                        parentStack: parentStack,
                        created: Date.now()
                    };
                    trackedCount++;
                }

                this.start();
            };

            // Hook Thread.run() — child executes
            Thread.run.implementation = function () {
                var threadName = this.getName();
                var objId = Java.use('java.lang.System').identityHashCode(this);
                var trackKey = 'T' + objId;
                var parentInfo = parentStacks[trackKey];

                if (parentInfo) {
                    console.log(TAG + ' ═══ Thread.run() [child] ═══');
                    console.log(TAG + ' Thread: "' + threadName + '" (tracking ID: ' + parentInfo.id + ')');
                    console.log(TAG + ' CHILD stack (execution site):');
                    console.log(captureStack(10));
                    console.log(TAG + ' ← LINKED TO PARENT:');
                    console.log(parentInfo.parentStack);
                    console.log(TAG + ' ═══════════════════════');
                    delete parentStacks[trackKey];
                    trackedCount--;
                }

                this.run();
            };

            console.log(TAG + ' Thread creation hooks active');
        } catch (e) {
            console.log(TAG + ' Thread hook skip: ' + e.message);
        }
    }

    // ═══════════════════════════════════════════════
    // 2. ExecutorService / ThreadPoolExecutor
    // ═══════════════════════════════════════════════
    if (TRACE_ASYNC) {
        try {
            var AbstractExecutorService = Java.use('java.util.concurrent.AbstractExecutorService');
            AbstractExecutorService.submit.overload('java.lang.Runnable').implementation = function (runnable) {
                var stack = captureStack(15);
                console.log(TAG + ' ExecutorService.submit(Runnable)');
                console.log(TAG + ' Runnable class: ' + runnable.$className);
                console.log(TAG + ' Submit stack:');
                console.log(stack);
                return this.submit(runnable);
            };
        } catch (e) { }

        try {
            var ThreadPoolExecutor = Java.use('java.util.concurrent.ThreadPoolExecutor');
            ThreadPoolExecutor.execute.implementation = function (command) {
                var stack = captureStack(15);
                console.log(TAG + ' ThreadPoolExecutor.execute()');
                console.log(TAG + ' Command class: ' + command.$className);
                console.log(TAG + ' Execute stack:');
                console.log(stack);
                this.execute(command);
            };
        } catch (e) { }

        // Handler.post / postDelayed
        try {
            var Handler = Java.use('android.os.Handler');
            Handler.post.implementation = function (runnable) {
                console.log(TAG + ' Handler.post() → ' + runnable.$className);
                console.log(TAG + ' Post stack:');
                console.log(captureStack(10));
                return this.post(runnable);
            };

            Handler.postDelayed.overload('java.lang.Runnable', 'long').implementation = function (runnable, delay) {
                console.log(TAG + ' Handler.postDelayed(' + delay + 'ms) → ' + runnable.$className);
                console.log(TAG + ' Post stack:');
                console.log(captureStack(10));
                return this.postDelayed(runnable, delay);
            };
        } catch (e) { }

        // AsyncTask (deprecated but still widely used)
        try {
            var AsyncTask = Java.use('android.os.AsyncTask');
            AsyncTask.execute.overload('[Ljava.lang.Object;').implementation = function (params) {
                console.log(TAG + ' AsyncTask.execute() class: ' + this.$className);
                console.log(TAG + ' Execute stack:');
                console.log(captureStack(15));
                return this.execute(params);
            };
        } catch (e) { }

        console.log(TAG + ' Async/Handler/AsyncTask hooks active');
    }

    // ═══════════════════════════════════════════════
    // 3. Kotlin Coroutines
    // ═══════════════════════════════════════════════
    if (TRACE_COROUTINES) {
        try {
            var CoroutineDispatcher = Java.use('kotlinx.coroutines.CoroutineDispatcher');
            CoroutineDispatcher.dispatch.implementation = function (context, block) {
                console.log(TAG + ' Coroutine dispatch: ' + block.$className);
                console.log(TAG + ' Context: ' + context.toString());
                console.log(TAG + ' Dispatch stack:');
                console.log(captureStack(10));
                this.dispatch(context, block);
            };
            console.log(TAG + ' Coroutine dispatcher hook active');
        } catch (e) {
            console.log(TAG + ' Coroutine hooks skipped (no kotlinx.coroutines)');
        }
    }

    console.log(TAG + ' === Stack Trace Helper loaded ===');
    console.log(TAG + ' Features: thread linking, async tracing, coroutine tracing');
    console.log(TAG + ' Max tracked threads: ' + MAX_TRACKED_THREADS);
});
