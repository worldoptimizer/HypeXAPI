/*!
Hype xAPI 1.0.6
copyright (c) 2022 Max Ziebell, (https://maxziebell.de). MIT-license
*/

/*
* Version-History
* 1.0.0	Initial release under MIT-license
* 1.0.1 Added context lookup and config/dataset key, fixed result lookup
* 1.0.2 Added support for functions in the lookup directly
* 1.0.3 Resolving functions works recursive and variables are supported
* 1.0.4 Fixed resolve error in the variable syntax when returning objects from functions
* 1.0.5 Added resolve of array notation, adding support for local execution and export script
* 1.0.6 Added documentation, Fixed regression, 
*/
if("HypeXAPI " in window === false) window['HypeXAPI'] = (function () {
    
    var _extensionName = 'Hype xAPI ';
    
    /**
     * This function is determines if we in a Hype Preview. 
     *
     * @return {Boolean} Return true if not on device
     */
    function isHypePreview(){
        return window.location.href.indexOf("127.0.0.1:") != -1 &&
            window.location.href.indexOf("/preview/") != -1;
    }
    
    var _error = false;
    
    var _default = {
    
        /* use HypeActionEvents if available for expressions */
        useHypeActionEvents: true,
    
        getDefaultActor: function(){
            return getDefault('defaultActor');
        },
        
        /*  
         * defaultActor should be overwritten by the LMS
         */
        defaultActor: {},
    
        /*
         * Debugging in Hype
         * TODO: maybe link to ADL.XAPIWrapper.log.debug
         * or allow way to make it accessible via Hype
         */
        debug: false,
    
        /*
         * Lookup to add your own actors
         */
        actors: {},

        /*
         * Lookup to add your own verbs
         */
        verbs: {},
        
        /*
         * Lookup to add your own objects
         */
        objects: {},
        
        /*
         * Lookup to add your own context
         */
        context: {},
        
        /*
         * Lookup to add your own results
         */
        results: {},
        
        /*
         * Lookup to add your own results
         */
        variables: {},
                    
        /*
         * Default error handling function
         */
        xhrRequestOnError: function(xhr, method, url, callback, callbackargs) {

            var response = xhr.response? JSON.parse(xhr.response) : {};
            // render error message
            console.error(
                "%c"+_extensionName+' Error'+
                "%c"+' version '+HypeXAPI.version+"\n\n"+
                "%c"+ (response.message? response.message : 'There was an error'+xhr.status + " " + xhr.statusText)+
                "%c"+"\n\n",
                 "font-size:12px; font-weight:bold",
                 "font-size:8px",
                 "min-height:40px;display: inline-block; padding: 10px; background-color: rgba(255,255,255,0.25); border: 1px solid lightgray; border-radius: 4px; font-family:Monospace; font-size:12px",
                 "font-size:11px",
                 (response.message? '' : xhr)
            );
            
            _error = true;
        }
    }
    
    /**
     * This function takes a key and returns an array of the key
     * @param {string} key
     * @returns {array}
     */
    function resolveKeyToArray(key){
        if(Array.isArray(key)) return key.reduce(function(a,b){
            return a.concat(resolveKeyToArray(b));
        },[]);
        if (typeof key != 'string') return;
        key = key.replace(/\[(\d+)\]/g, function(match, key){
            return '.'+parseInt(key);
        });
        key = key.replace(/^\./, '');
        return key.split('.');
    }
    
    /**
     * This function takes an object, a key and a boolean value and returns the value of the object at the key.
     *
     * @param {object} obj - The object to be searched.
     * @param {string} key - The key to be searched for.
     * @param {boolean} create - A boolean value that determines whether the object should be created if it does not exist.
     * @returns {object} - The value of the object at the key.
     */
    function resolveObjectByKey(obj, key, create) {
        var keyParts = resolveKeyToArray(key);
        var objValue = obj;
        var i = 0;
        while (objValue!==undefined && i < keyParts.length) {
            
            if (create && objValue[keyParts[i]] == undefined) {
                if (keyParts[i+1] && /^\d+$/.test(keyParts[i+1])){
                    objValue[keyParts[i]] = [];
                } else {
                    objValue[keyParts[i]] = {};
                }
            }
            
            objValue = objValue[keyParts[i]];
            
            if (typeof objValue === 'function') {
                objValue = objValue();
            }
            i++;
        }
        return objValue;
    }
 
    /**
     * Resolves functions and variables in an object
     *
     * @param {Object} obj - The object to resolve
     * @param {Object} lookup - The lookup object
     * @returns {Object} - The resolved object
     */ 
    function resolveFunctionsAndVars(obj, lookup) {
        while (typeof obj === 'function') obj = obj();
        if (typeof obj === 'object') {
            lookup = lookup || {};
            for (var key in obj) {
                if (typeof obj[key] === 'object') {
                    resolveFunctionsAndVars(obj[key], lookup);
                } else if (typeof obj[key] === 'function') {
                    obj[key] = obj[key]();
                } else if (typeof obj[key] === 'string') {
                    var matches = obj[key].match(/\$\{(.*?)\}/g);
                    if (matches) {
                        matches.forEach(function(match) {
                            var variableKey = match.replace(/\$\{|\}|\(\)/g, '');
                            var variableValue = resolveObjectByKey(lookup, variableKey);
                            obj[key] = obj[key].replace(match, variableValue);
                        });
                    }
                }
            }
        }
        return obj;
    }
    
    /**
     * This function is used to resolve the object notation.
     *
     * @param {string} str - The string to be resolved.
     * @param {object} variables - The variables to be used.
     * @returns {object} - The resolved object.
     */
    function resolveObjectNotation(str, variables){
        if (/^\{.*\}$/.test(str)){
            try {
                return new Function('$ctx', 'with($ctx) { return new Object(' + str + ')}')(variables);
            } catch (e) {
                try {
                    return JSON.parse(str);
                } catch (e) {
                    if (getDefault('debug')) console.error ("xAPI: Malformed object notation:\n"+key)
                    return null;
                }
            }
        }
        return null;
    }
    
    /**
     * Resolve a dictionary key
     *
     * @param {Object} dict - The dictionary
     * @param {Object} key - The key
     * @param {Object} variables - The variables
     * @returns {Object}
     */
    function resolveDictonaryKey(dict, key, variables){
        switch (typeof(key)){
            case "string":
                key = key.trim();
                
                var obj = resolveObjectNotation(key, variables);
                if (obj) return obj;
                
                if (getDefault(dict) && typeof(getDefault(dict)[ key ])=='object') {
                    return cloneObject(getDefault(dict)[ key ]);
                }
                
                return resolveVerbADL(key);
                break;
            
            case "object":
                // forward object
                return key;
                break;
        }
    }
    
    /**
     * Resolve verb looking at ADL verbs (xAPI)
     *
     * Existing list of verbs (xapi.vocab.pub/index.html or console.log(ADL.verbs) ): 
     *
     * abandoned, answered, asked, attempted, attended, commented, completed, 
     * exited, experienced, failed, imported, initialized, interacted, launched, 
     * mastered, passed, preferred, progressed, registered, responded, resumed, 
     * satisfied, scored, shared, suspended, terminated, voided
     *
     * @param {string} id - The verb id
     * @returns {object} - The verb object or null
     */   
    function resolveVerbADL(id){
        if (ADL.verbs && ADL.verbs[id]) {
            return ADL.verbs[id];
        }
    }
    
    /**
     * This function clones an object
     *
     * @param {object} obj - The object to be cloned
     * @returns {object} - The cloned object
     */
    function cloneObject(obj) {
        if (null == obj || "object" != typeof obj) return obj;
        var copy = obj.constructor();
        for (var attr in obj) {
            if (obj.hasOwnProperty(attr)) copy[attr] = cloneObject(obj[attr]);
        }
        return copy;
    }
    
    /**
     * This function send a statement based on dataset attributes
     *
     * @param {HTMLDivElement} element This is the element the attributes should be taken from
     */
    function sendStatementByDataset(element){
        
        // only act if event target is defined
        if (!element) return;
        
        sendStatementByDictonary({
            element: element,
        })
    }
    /**
     * Get the xAPI configuration from the element attributes
     *
     * @param {HTMLElement} element
     * @returns {Object}
     */
    function getXapiConfigFromAttributes(element) {
        var config = {};
        var attrs = element.attributes;
        for (var i = 0; i < attrs.length; i++) {
            var attr = attrs[i];
            if (attr.name.indexOf('data-xapi-') === 0) {
                var key = attr.name.replace('data-xapi-', '');
                config[key] = attr.value;
            }
        }
        return config;
    }
    
      

    
    /**
     * This function send a statement based on a config object equivalent to the dataset keys (without data-xapi- prefix).
     * It will resolve all the keys in the config object and send the statement.
     *
     * @param {Object} config This is an config object containing all the keys for the statement (at least verb and object are necessary).
     * @param {Object} config.element This is the element that will be used to get the xapi config from the attributes.
     * @param {Object} config.agent This is the agent that will be used in the statement.
     * @param {Object} config.verb This is the verb that will be used in the statement.
     * @param {Object} config.object This is the object that will be used in the statement.
     * @param {Object} config.result This is the result that will be used in the statement.
     * @param {Object} config.context This is the context that will be used in the statement.
     * @param {Object} config.parent-activity This is the parent activity that will be used in the statement.
     * @param {Object} config.grouping-activity This is the grouping activity that will be used in the statement.
     * @param {Object} config.context-activity This is the context activity that will be used in the statement.
     * @param {Object} config.verb-id This is the verb id that will be used in the statement.
     * @param {Object} config.verb-name This is the verb name that will be used in the statement.
     * @param {Object} config.object-id This is the object id that will be used in the statement.
     * @param {Object} config.object-name This is the object name that will be used in the statement.
     * @param {Object} config.object-desc This is the object description that will be used in the statement.
     */
    function sendStatementByDictonary(config){
                
        // only act if event target is defined
        if (!config) return;
        
        if (config.element){
            config = Object.assign(getXapiConfigFromAttributes(config.element), config)
        }
        
        // search for keys in lookup, TODO search in hypeDocument functions       
        var variables = config['variables'] || getDefault('variables');
        
        var xAPI_actor = resolveFunctionsAndVars( resolveDictonaryKey('actors', config['agent'], variables), variables);
        var xAPI_verb = resolveFunctionsAndVars( resolveDictonaryKey('verbs', config['verb'], variables), variables);
        var xAPI_object = resolveFunctionsAndVars( resolveDictonaryKey('objects', config['object'], variables), variables);
        var xAPI_result = resolveFunctionsAndVars( resolveDictonaryKey('results', config['result'], variables), variables);
        var xAPI_context = resolveFunctionsAndVars( resolveDictonaryKey('context', config['context'], variables), variables);

        var xAPI_parent_activity = resolveFunctionsAndVars( resolveDictonaryKey('objects', config['parent-activity'], variables), variables);
        var xAPI_grouping_activity = resolveFunctionsAndVars( resolveDictonaryKey('objects', config['grouping-activity'], variables), variables);
        var xAPI_context_activity = resolveFunctionsAndVars( resolveDictonaryKey('objects', config['context-activity'], variables), variables);
        
        // allow construction of verb
        if (!xAPI_verb) {
            var verbId = config['verb-id'];
            var verbName = config['verb-name'];
            if (verbId && verbName) {
                xAPI_verb = { 
                    id: verbId, 
                    display: { 'en-US': verbName}
                }
            }
        }
        
        // create xAPI object if it doesn't exist and is configured to be created 
        if (!xAPI_object) {
        
            // check if config object exists
            if (config['object-id'] && config['object-name'] && config['object-desc']) {
        
                // create xAPI object
                xAPI_verb = {
                    "objectType": "Activity",
                    "id": config['object-id'],
                    "definition": {
                        "name": {
                            "en-US": config['object-name']
                        },
                        "description": {
                            "en-US": config['object-desc']
                        }
                    }
                }
            }
        }
        
        // check if an xAPI statement has already been created
        if (!xAPI_actor) {
            // Then, check if the variables necessary to create an actor have been provided
            if ((config['agent-name'] && config['agent-mbox']) || (config['agent-account-page'] && config['agent-account-name'])) {
                // If they have, create an xAPI actor object
                xAPI_actor = { "objectType": "Agent" }
                // If there is a name for the actor, add it to the object
                if (config['agent-name']) {
                    xAPI_actor.name = config['agent-name'];
                }
                // If there is an email address for the actor, add it to the object
                if (config['agent-mbox']) {
                    // If the email address is to be hashed, hash it
                    if (config['agent-hash-mbox']) {
                        xAPI_actor.mbox = ADL.XAPIWrapper.hash('mailto:' + config['agent-mbox']);
                    } else {
                        // If it is not to be hashed, leave it as is
                        xAPI_actor.mbox = 'mailto:' + config['agent-mbox'];
                    }
                }
                // If there is an account page and account name, add them to the object
                if (config['agent-account-page'] && config['agent-account-name']) {
                    xAPI_actor.account = {
                        homePage: config['agent-account-page'],
                        name: config['agent-account-name']
                    }
                }
            } else {
                // If not all of the variables have been provided, use the default actor
                xAPI_actor = getDefault('getDefaultActor')();
            }
        }
        
        
        // Check if the actor is already defined
        if (!xAPI_actor) {
            // Check if we have the necessary values to build an actor object
            if ((config['agent-name'] && config['agent-mbox']) || (config['agent-account-page'] && config['agent-account-name'])) {
                xAPI_actor = { "objectType": "Agent" }
                // If the name is defined, add it to the actor object
                if (config['agent-name']) {
                    xAPI_actor.name = config['agent-name'];
                }
                // If the email is defined, add it to the actor object
                if (config['agent-mbox']) {
                    // If we have to hash the email
                    if (config['agent-hash-mbox']) {
                        // Hash the email
                        xAPI_actor.mbox = ADL.XAPIWrapper.hash('mailto:' + config['agent-mbox']);
                    } else {
                        // Add email to actor object
                        xAPI_actor.mbox = 'mailto:' + config['agent-mbox'];
                    }
                }
                // If the account page and name are defined, add them to the actor object
                if (config['agent-account-page'] && config['agent-account-name']) {
                    // Add account info to the actor object
                    xAPI_actor.account = {
                        homePage: config['agent-account-page'],
                        name: config['agent-account-name']
                    }
                }
            } else {
                // If we do not have the necessary values to build an actor object 
                // we will call the function to get the default actor object
                xAPI_actor = getDefault('getDefaultActor')();
            }
        }

        // if we have everything construct and send statement
        if (xAPI_actor && xAPI_verb && xAPI_object) {
            
            var stmt = new ADL.XAPIStatement(
                xAPI_actor,
                xAPI_verb,
                xAPI_object,
            );
            
            // set result if present
            if (xAPI_result) stmt.result = xAPI_result;
            
            // set context if present
            if (xAPI_context) stmt.context = xAPI_context;
            
            stmt.generateId();
            
            // allow optional context, grouping or parent activities
            if (xAPI_parent_activity) stmt.addParentActivity( xAPI_parent_activity );
            if (xAPI_grouping_activity) stmt.addGroupingActivity( xAPI_grouping_activity );
            if (xAPI_context_activity) stmt.addOtherContextActivity( xAPI_context_activity );
            
            stmt.generateRegistration();
        
            sendStatement(stmt, config['debug'])
            
        } else {
            console.log('xAPI: Please provide a valid verb, object and (default) actor!');
        }
    }
    
    /**
     * Send a statement to the LRS
     *
     * @param {Object} stmt - The statement to send
     * @param {string} debug - The debug mode
     */
    function sendStatement(stmt, debug) {
        
        // send statement
        _error = false;    
        var resp_obj = ADL.XAPIWrapper.sendStatement(stmt);
        
        // if debugging is enabled print to console or even echo the statement by fetching it again
        if (getDefault('debug') && debug !== null) {
            console.log(JSON.stringify(stmt, null, '    '));
            if (!_error && debug == 'echo') {
                var ret = ADL.XAPIWrapper.getStatements({"statementId":resp_obj.id});
                console.log(ret);
            }
        }
    }
    
    /**
     * This function forwards an updated config to ADL.XAPIWrapper
     *
     * @param {Object} config This is an object containing config parameter
     */
    function changeConfig (config){
        ADL.XAPIWrapper.changeConfig(config);
    }
            
    /**
     * This function set the default actor using setDefault
     * it has its own function to make it stand out a little
     *
     * @param {Object} config This is an object containing config parameter
     */
    function setDefaultActor (actor){
        setDefault('defaultActor', actor);
    }
    
    /**
     * Evaluate a javascript expression in the context of an object
     *
     * @param {string} expression The expression to evaluate
     * @param {object} context The context to evaluate the expression inside
     * @return {any} The result of the evaluation
     */
    function runExpression(expression, variables){
        try {
            console.log(variables)
            return new Function('$ctx', 'with($ctx) {'+ expression + '}')(variables);
        } catch (e) {
            console.error(e)
        }
    }

    /**
     * This function allows to override a global default by key or if a object is given as key to override all default at once
     *
     * @param {String} key This is the key to override
     * @param {String|Function|Object} value This is the value to set for the key
     */
     function setDefault(key, value){
        //allow setting all defaults
        if (typeof(key) == 'object') {
            _default = key;
            return;
        }

        //set specific default
        _default[key] = value;
    }

    /**
     * This function returns the value of a default by key or all default if no key is given
     *
     * @param {String} key This the key of the default.
     * @return Returns the current value for a default with a certain key.
     */
    function getDefault(key){
        // return all defaults if no key is given
        if (!key) return _default;

        // return specific default
        return _default[key];
    }

    function HypeDocumentLoad (hypeDocument, element, event) {
        // Remind user to load also xapiwrapper or prepare ADL to use
        if (!ADL) {
            alert('Please load xapiwrapper before loading HypeXAPI');
            return;
        }
        
        /**
         * Redirects the error handler to getDefault('xhrRequestOnError')
         * @param {Object} xhr - The XMLHttpRequest object
         * @param {String} method - The HTTP method used
         * @param {String} url - The URL of the request
         * @param {Function} callback - The callback function
         * @param {Object} callbackargs - The arguments to be passed to the callback function
         */
        ADL.xhrRequestOnError = function(xhr, method, url, callback, callbackargs){
            getDefault('xhrRequestOnError')(xhr, method, url, callback, callbackargs);
        }
        
        /**
         * Send a statement to the LRS.
         * 
         * This function is used by a GUI component that only has string input fields, the LRS notation is then fetched from a lookup based on the provided string keys (HypeXAPI.hype-export.py).
         * 
         * @param {string} verb - The verb of the statement.
         * @param {string} object - The object of the statement.
         * @param {string} context - The context of the statement.
         * @param {string} result - The result of the statement.
         * @param {string} actor - The actor of the statement.
         */
        hypeDocument.sendStatementByArguments = function (verb, object, result, context, actor){
            sendStatementByDictonary({
                verb: verb,
                object: object,
                context: context,
                result: result,
                actor: actor,
                variables: Object.assign(
                    {}, 
                    getDefault('variables'),
                    hypeDocument.customData, 
                )
            })
        }
        
       /**
        * This function sends a statement to the LRS using the data-xapi-* attributes of the element.
        *
        * @param {HTMLElement} element - The element to send the statement for.
        */
        hypeDocument.sendStatementByDataset = function(element){
            sendStatementByDictonary({
                element: element,
                store: Object.assign(
                    {},
                    getDefault('variables'),
                    hypeDocument.customData,
                )
            })
        }
        
        hypeDocument.runExpression = function(expression){
            if (_default['useHypeActionEvents'] && ("HypeActionEvents" in window)){
                return hypeDocument.triggerAction (expression);
            }
            runExpression(expression, hypeDocument.customData)
        }
        
        /**
         * Set a custom data variable (forwards it from the hypeDocument context)
         * 
         * This function is used to set a custom data variable that can be used in the LRS notation.
         * 
         * @param {string} key - The key of the custom data variable.
         * @param {string} value - The value of the custom data variable.
         */
        hypeDocument.setCustomDataVariable = function(key, value){
            setCustomDataVariable(key, value, hypeDocument.customData)
        }
        
        /**
         * This function is called on HypeDocumentLoad.
         * It fires the HypeXAPI function if it exists.
         * @param {HypeDocument} hypeDocument - The HypeDocument object.
         * @param {HTMLElement} element - The element that triggered the event (document).
         * @param {Event} event - The HypeDocumentLoad event object.
         */
        if (typeof hypeDocument.functions().HypeXAPI == 'function'){
            hypeDocument.functions().HypeXAPI(hypeDocument, element, event);
        }
    }
    
    /**
     * Set a custom data variable.
     * 
     * This function is used to set a custom data variable that can be used in the LRS notation.
     * 
     * @param {string} key - The key of the custom data variable.
     * @param {string} value - The value of the custom data variable.
     * @param {object} store - The object to store the custom data variable in.
     */
    setCustomDataVariable = function(key, value, store){
        if (key && typeof(store) == 'object') {
            
            var baseKey = resolveKeyToArray(key);
            var variableKey = baseKey.pop();
            if (baseKey.length){
                store = resolveObjectByKey(store, baseKey, true);
            }
            
            if (value.match(/^[0-9]+(\.[0-9]+)?$/)) {
                value = parseFloat(value);
                
            } else if (value.trim().match(/^(true|false)$/i)) {
                value = value.trim().toLowerCase() === 'true';
                
            } else {
                var obj = resolveObjectNotation(value, store);
                if (obj) value = obj;
                
            }
            
            store[variableKey] = value;
        }
    }
    
    /* setup callbacks */
    if("HYPE_eventListeners" in window === false) { window.HYPE_eventListeners = Array();}
    window.HYPE_eventListeners.push({"type":"HypeDocumentLoad", "callback": HypeDocumentLoad});
        
    /**
     * @typedef {Object} HypeXAPI
     * @property {String} version Version of the extension
     * @property {Function} getDefault Get a default value used in this extension
     * @property {Function} setDefault Set a default value used in this extension
     * @property {Function} setDefaultActor Set the default actor using setDefault('defaultActor')
     * @property {Function} sendStatementByDataset Send a statement based on dataset attributes
     * @property {Function} sendStatementByDictonary Send a statement based on a config object equivalent to the dataset keys (without data-xapi- prefix)
     * @property {Function} changeConfig Forward updated config to ADL.XAPIWrapper
     * @property {Object} GUI Contains functions as fallback for the export script.
      * @property {Function} GUI.setCustomDataVariable Set a custom data variable
      * @property {Function} GUI.sendStatementByArguments Send a statement based on function arguments
     */
     var HypeXAPI = {
        version: '1.0.6',
        getDefault: getDefault,
        setDefault: setDefault,
        setDefaultActor: setDefaultActor,
        sendStatement: sendStatement,
        sendStatementByDataset: sendStatementByDataset,
        sendStatementByDictonary: sendStatementByDictonary,
        
        /* forward commands to ADL.XAPIWrapper */
        changeConfig: changeConfig,
        
        /* GUI fallback if not mapped to hypeDocument*/
        GUI: {
            runExpression: function(expression){
                runExpression(expression, getDefault('variables')) 
            },
            
            setCustomDataVariable: function(key, value){
                setCustomDataVariable(key, value, getDefault('variables'))
            },
            
            sendStatementByArguments: function (verb, object, result, context, actor){
                sendStatementByDictonary({
                    verb: verb,
                    object: object,
                    context: context,
                    result: result,
                    actor: actor
                })
            }
            
        }
    };

    /** 
     * Reveal Public interface to window['HypeXAPI']
     * return {HypeXAPI}
     */
    return HypeXAPI;
    
})();
