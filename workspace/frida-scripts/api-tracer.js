/**
 * API Tracer — Retrofit Interface Methods
 * Hooks Retrofit-annotated interface methods: @GET, @POST, @PUT, @DELETE, @PATCH, @HEAD
 * Logs: annotation, path, parameters, invocation args
 * Usage: frida -U -f <pkg> -l api-tracer.js
 */

'use strict';

Java.perform(function () {
    var TAG = '[API-Tracer]';

    var annotationClasses = [
        'retrofit2.http.GET', 'retrofit2.http.POST', 'retrofit2.http.PUT',
        'retrofit2.http.DELETE', 'retrofit2.http.PATCH', 'retrofit2.http.HEAD',
        'retrofit2.http.HTTP'
    ];

    var paramAnnotations = [
        'retrofit2.http.Query', 'retrofit2.http.QueryMap', 'retrofit2.http.Field',
        'retrofit2.http.FieldMap', 'retrofit2.http.Body', 'retrofit2.http.Path',
        'retrofit2.http.Header', 'retrofit2.http.HeaderMap', 'retrofit2.http.Part',
        'retrofit2.http.PartMap', 'retrofit2.http.Url'
    ];

    function getAnnotationValue(annotation) {
        try {
            return annotation.value();
        } catch (e) {
            return '';
        }
    }

    // Enumerate classes and find Retrofit interfaces
    setTimeout(function () {
        Java.enumerateLoadedClasses({
            onMatch: function (className) {
                try {
                    var clazz = Java.use(className).class;
                    if (!clazz.isInterface()) return;

                    var methods = clazz.getDeclaredMethods();
                    for (var i = 0; i < methods.length; i++) {
                        var method = methods[i];
                        var annotations = method.getAnnotations();

                        for (var j = 0; j < annotations.length; j++) {
                            var annType = annotations[j].annotationType().getName();

                            for (var k = 0; k < annotationClasses.length; k++) {
                                if (annType === annotationClasses[k]) {
                                    var httpMethod = annType.split('.').pop();
                                    var path = getAnnotationValue(annotations[j]);

                                    // Collect parameter annotations
                                    var params = [];
                                    var paramAnns = method.getParameterAnnotations();
                                    for (var p = 0; p < paramAnns.length; p++) {
                                        var pAnns = paramAnns[p];
                                        for (var q = 0; q < pAnns.length; q++) {
                                            var pType = pAnns[q].annotationType().getName();
                                            var pName = pType.split('.').pop();
                                            try {
                                                pName += '(' + pAnns[q].value() + ')';
                                            } catch (e) { }
                                            params.push(pName);
                                        }
                                    }

                                    console.log('[API-TRACE] ' + JSON.stringify({
                                        interface: className,
                                        method: method.getName(),
                                        httpMethod: httpMethod,
                                        path: path,
                                        params: params
                                    }));
                                }
                            }
                        }
                    }
                } catch (e) { }
            },
            onComplete: function () {
                console.log(TAG + ' Retrofit interface scan complete');
            }
        });
    }, 3000); // delay to allow app class loading

    // --- Hook Retrofit create() to catch dynamic proxy invocations ---
    try {
        var Retrofit = Java.use('retrofit2.Retrofit');
        Retrofit.create.implementation = function (service) {
            var serviceName = service.getName();
            console.log(TAG + ' Retrofit.create(' + serviceName + ')');
            return this.create(service);
        };
        console.log(TAG + ' Retrofit.create hooked');
    } catch (e) {
        console.log(TAG + ' Retrofit.create skip: ' + e.message);
    }

    // --- Hook ServiceMethod to capture actual invocations ---
    try {
        var ServiceMethod = Java.use('retrofit2.ServiceMethod');
        ServiceMethod.invoke.implementation = function (args) {
            console.log(TAG + ' ServiceMethod.invoke with ' + (args ? args.length : 0) + ' args');
            for (var i = 0; args && i < args.length; i++) {
                console.log(TAG + '   arg[' + i + '] = ' + String(args[i]));
            }
            return this.invoke(args);
        };
    } catch (e) { }

    console.log(TAG + ' === API Tracer loaded ===');
});
