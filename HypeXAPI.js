/*!
Hype xAPI 1.0.5
copyright (c) 2022 Max Ziebell, (https://maxziebell.de). MIT-license
*/

/*
* Version-History
* 1.0.0	Initial release under MIT-license
* 1.0.1 Added context lookup and config/dataset key, fixed result lookup
* 1.0.2 Added support for functions in the lookup directly
* 1.0.3 Resolving functions works recursive and variables are supported
* 1.0.4 Fixed resolve error in the variable syntax when returning objects from functions
* 1.0.5 Added resolve of array notation
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
    
        getDefaultActor: function(){
            return getDefault('defaultActor');
        },
        
        /*  
         * defaultActor should be overwritten by the LMS
         */
        defaultActor: {},
    
        /*
         * Debugging in Hype
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
     * Resolve verb looking at custom verbs and falling back onto ADL verbs
     *
     * Existing list of verbs (xapi.vocab.pub/index.html or console.log(ADL.verbs) ): 
     *
     * abandoned, answered, asked, attempted, attended, commented, completed, 
     * exited, experienced, failed, imported, initialized, interacted, launched, 
     * mastered, passed, preferred, progressed, registered, responded, resumed, 
     * satisfied, scored, shared, suspended, terminated, voided
     */
     
    function resolveVerb(id){
        return getDefault('verbs')[id] || ADL.verbs[id] || null;
    }
    
    
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
     * Resolve function and vars in the lookup
     *
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
                            var variable = match.replace(/\$\{|\}|\(\)/g, '');
                            var variableParts = resolveKeyToArray(variable);
                            var variableValue = lookup;
                            var i = 0;
                            while (variableValue!==undefined && i < variableParts.length) {
                                variableValue = variableValue[variableParts[i]];
                                if (typeof variableValue === 'function') {
                                    variableValue = variableValue();
                                }
                                i++;
                            }
                            obj[key] = obj[key].replace(match, variableValue);
                        });
                    }
                }
            }
        }
        return obj;
    }
    
    /**
     * This function send a statement based on dataset attributes
     *
     * @param {HTMLDivElement} element This is the element the attributes should be taken from
     */
    function sendStatementByDataset(element){
        // only act if event target is defined
        if (!element) return;
        
        // get attributes
        var config = {
            'agent':                element.getAttribute('data-xapi-agent'),
            'verb':                 element.getAttribute('data-xapi-verb'),
            'object':               element.getAttribute('data-xapi-object'),
            'result':               element.getAttribute('data-xapi-result'),
            'context':              element.getAttribute('data-xapi-context'),
            
            'parent-activity':      element.getAttribute('data-xapi-parent-activity'),
            'grouping-activity':    element.getAttribute('data-xapi-grouping-activity'),
            'context-activity':     element.getAttribute('data-xapi-context-activity'),
            
            'verb-id':              element.getAttribute('data-xapi-verb-id'),
            'verb-name':            element.getAttribute('data-xapi-verb-name'),
            
            'object-id':            element.getAttribute('data-xapi-object-id'),
            'object-name':          element.getAttribute('data-xapi-object-name'),
            'object-desc':          element.getAttribute('data-xapi-object-desc'),
            
            'agent-name':           element.getAttribute('data-xapi-agent-name'),
            'agent-mbox':           element.getAttribute('data-xapi-agent-mbox'),
            'agent-hash':           element.hasAttribute('data-xapi-agent-hash'),
            'agent-account-page':   element.getAttribute('data-xapi-agent-account-page'),
            'agent-account-name':   element.getAttribute('data-xapi-agent-account-name'),
            
            'debug':  element.getAttribute('data-xapi-debug'),  
        }
        
        sendStatementByConfig(config);
    }
    
    /**
     * This function send a statement based on a config object equivalent to the dataset keys (without data-xapi- prefix)
     *
     * @param {Object} config This is an config object containing all the keys for the statement (at least verb and object are necessary)
     */
    function sendStatementByConfig(config){
        // only act if event target is defined
        if (!config) return;
        
        // search for keys in lookup, TODO search in hypeDocument functions       
        var xAPI_actor = resolveFunctionsAndVars( getDefault('actors')[ config['agent'] ] || config['agent'], getDefault('variables'));
        var xAPI_verb = resolveFunctionsAndVars( resolveVerb(config['verb']) || config['verb'], getDefault('variables'));
        var xAPI_object = resolveFunctionsAndVars( getDefault('objects')[ config['object'] ] || config['object'], getDefault('variables'));
        var xAPI_result = resolveFunctionsAndVars( getDefault('results')[ config['result'] ] || config['result'], getDefault('variables'));
        var xAPI_context = resolveFunctionsAndVars( getDefault('context')[ config['context'] ] || config['context'], getDefault('variables'));

        var xAPI_parent_activity = resolveFunctionsAndVars( getDefault('objects')[ config['parent-activity'] ] || config['parent-activity'], getDefault('variables'));
        var xAPI_grouping_activity = resolveFunctionsAndVars( getDefault('objects')[ config['grouping-activity'] ] || config['grouping-activity'], getDefault('variables'));
        var xAPI_context_activity = resolveFunctionsAndVars( getDefault('objects')[ config['context-activity'] ] || config['context-activity'], getDefault('variables'));
        
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
        
        // allow construction of object
        if (!xAPI_object) {
            if (config['object-id'] && config['object-name'] && config['object-desc']) {
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
        
        // allow construction of actor or fallback on default
        if (!xAPI_actor) { 
            if((config['agent-name'] && config['agent-mbox']) || (config['agent-account-page'] && config['agent-account-name'])) {
                xAPI_actor = { "objectType": "Agent" }
                if (config['agent-name']) {
                    xAPI_actor.name = config['agent-name'];
                }
                if (config['agent-mbox']) {
                   if (config['agent-hash-mbox']) {
                       xAPI_actor.mbox = ADL.XAPIWrapper.hash( 'mailto:' + config['agent-mbox'] );
                   } else {
                       xAPI_actor.mbox = 'mailto:' + config['agent-mbox'];
                   }
                }
                if (config['agent-account-page'] && config['agent-account-name']){
                    xAPI_actor.account = {
                        homePage: config['agent-account-page'],
                        name: config['agent-account-name']		    
                    }
                }
            } else {
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
        
        // Redirects the error handler to getDefault('xhrRequestOnError')
        ADL.xhrRequestOnError = function(xhr, method, url, callback, callbackargs){
            getDefault('xhrRequestOnError')(xhr, method, url, callback, callbackargs);
        } 
        
        // Fire HypeXAPI on HypeDocumentLoad
        if (typeof hypeDocument.functions().HypeXAPI == 'function'){
            hypeDocument.functions().HypeXAPI(hypeDocument, element, event);
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
     * @property {Function} sendStatementByConfig Send a statement based on a config object equivalent to the dataset keys (without data-xapi- prefix)
     * @property {Function} changeConfig Forward updated config to ADL.XAPIWrapper
     */
     var HypeXAPI = {
        version: '1.0.5',
        getDefault: getDefault,
        setDefault: setDefault,
        setDefaultActor: setDefaultActor,
        sendStatement: sendStatement,
        sendStatementByDataset: sendStatementByDataset,
        sendStatementByConfig: sendStatementByConfig,
        
        /* forward commands to ADL.XAPIWrapper */
        changeConfig: changeConfig,
    };

    /** 
     * Reveal Public interface to window['HypeXAPI']
     * return {HypeXAPI}
     */
    return HypeXAPI;
    
})();
