/**
 * Element.matches() polyfill (simple version)
 * https://developer.mozilla.org/en-US/docs/Web/API/Element/matches#Polyfill
 */
if (!Element.prototype.matches) {
	Element.prototype.matches = Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
}
/**
* OE3 JS to handle DOM UI.
* Using "bluejay" as namespace
* @namespace
*/
const bluejay = (function () {

	'use strict';
	/*
	Set up some performance timers
	"Ready": called by './_last/ready.js' the last JS file concatenated by Gulp
	"DOM Loaded": called by "DOMContentLoaded" event (watching out for other scripts that are slowing things down)
	*/
	
	const logPrefix = "[bluejay]";
	const debug = true;	 // Output debug '[blue]' to console
	const bj = {};  // API for bluejay
	
	console.time(`${logPrefix} Ready`);
	console.time(`${logPrefix} DOM Loaded`);
	
	/**
	* Extend bluejay public methods
	* @param  {String}   name 	App method name
	* @param  {Function} fn   	The method
	* @returns {boolean}  
	*/
	bj.extend = (name, fn) => {
		
		if(typeof fn !== "function"){
			throw new TypeError('[bluejay] [app.js] - only extend with a function: ' + name); 
		}
		
		// only extend if not already added and available
		if(!fn._bj && !(name in bj)){		
			bj[name] = fn;
			fn._bj = true; // tag it
		} else {
			throw new TypeError('[bluejay] [app.js] - already extended with: ' + name); 
		}
	};
	
	/**
	* Log to console with a fixed prefix
	* @param {String} msg - message to log
	*/
	bj.log = (msg) => {
		if(debug) console.log( logPrefix + ' ' + msg );
	};
	
	/**
	* Gulp ensures that _last/ready.js is added last
	* to the JS file ...it calls ready: 
	*/
	bj.ready = () => {
		console.timeEnd(`${logPrefix} Ready`);
	};
	
	/**
	* Provide set up feedback whilst debugging
	*/
	if(debug){
		bj.log('OE JS UI layer ' + logPrefix + ' ...');
		bj.log('DEBUG MODE');
		bj.log('Mustache version: ' + Mustache.version);
		
		document.addEventListener('DOMContentLoaded', () => {
			bj.log('[Modules] - ' + bj.registeredModules() );
			console.timeEnd(`${logPrefix} DOM Loaded`);
		}, {once:true});
	}

	/* 
	Reveal public methods for bluejay
	*/
	return bj;

})();

/**
* Handle DOM collections
* Modules tend to handle DOM collections. 
* this should be of help... 
*/
(function( bj ) {
	'use strict';
	/**
	* Generator to create unique ids 
	* Used as Keys and in DOM data-bjc 
	*/
	function* IdGenerator(){
		let id = 10;
		while( true ){
			yield ++id;
		}
	}
	
	const iterator = IdGenerator();
	const getKey = () => iterator.next().value;
	
	bj.extend( 'getKey', getKey );
	
	/**
	* Handle DOM collections in modules
	* Create a Facade to Map to link the DOM data attribute
	* with the Map Key
	*/ 
	function Collection(){
		this.map = new Map();
		this.dataAttr =  'data-bjc';
	}
	
	/**
	* Add new Key / Value 
	* this is the reason behind the Facade: Link Key to DOM element.
	* @param {Object} value (anything)
	* @param {HTMLElement} el - linked DOM element
	* @returns {String} Key
	*/
	Collection.prototype.add = function( value, el ){
		const key = getKey(); // from Generator (see above)
		this.map.set( key, value );
		el.setAttribute( this.dataAttr, key );	 
		return key;
	};
	
	/**
	* Get Key from DOM element data attribute
	* @param {HTMLElement} el - DOM Element to check
	* @returns Key || False
	*/
	Collection.prototype.getKey = function( el ){
		let key = el.getAttribute( this.dataAttr );
		if( key === null || key == ""){
			return false;
		} else {
			return key;
		}
	};
	
	/**
	* Get value by key
	* @returns value
	*/
	Collection.prototype.get = function( key ){
		if( typeof key === "string") key = parseInt(key, 10);
		return this.map.get( key );
	};
	
	/**
	* Get the First added value
	* @returns value
	*/
	Collection.prototype.getFirst = function(){
		const iterator = this.map.values();
		return iterator.next().value;
	};
	
	/**
	* Get the 'next' value in collection
	* @param {Key} startKey - next key from here
	* @returns value
	*/
	Collection.prototype.next = function( startKey ){
		const it = this.map.keys();
		let key = it.next();
		
		while( !key.done ){
			if( key.value === startKey ) return it.next().value;
			key = it.next();
		}
	};
	
	/**
	* Get the 'previous' value in collection
	* @param {Key} startKey - previous key from here
	* @returns value
	*/
	Collection.prototype.prev = function( startKey ){
		const it = this.map.keys();
		let prevKey = false;
		
		for (const key of it ) {
		  if(key === startKey) return prevKey; // 
		  prevKey = key;
		}
	};
	
	/**
	* Has Key?
	* @returns {Boolean}
	*/
	Collection.prototype.has = function( key ){
		return this.map.has( key );
	};
	
	/**
	* Remove to allow GC
	* @returns {Boolean}
	*/
	Collection.prototype.delete = function( key ){
		return this.map.delete( key );
	};
	
	// API
	bj.extend( 'Collection', Collection );	

})( bluejay );
/**
* Custom App Events 
* (lets try and keep it loose)
*/
(function( bj ) {

	'use strict';
	
	/**
	* Create Custom Event
	* @param {string} eventType
	* @param {String} details
	*/
	const myEvent = ( eventType, eventDetail ) => {
		// bluejay.log('[Custom Event] - "'+eventType+'"');
		const event = new CustomEvent(eventType, {detail: eventDetail});
		document.dispatchEvent(event);
	};
		
	bj.extend('customEvent', myEvent);	
	
})( bluejay );
/**
* DOM Event Delegation
*/
(function( bj ) {

	'use strict';
	
	const urlHostName = new URL(window.location).hostname; // temporary for IDG, see "notifyListeners" below
	
	/**
	* Event Aggregation Pattern
	* To improve performance delegate all events for all Modules here.
	* Modules register selectors (to match) along with callbacks
	*/
	const mouseDown = new Map();	
	const mouseEnter = new Map();	
	const mouseLeave = new Map();	
	const click = new Map();
	const resize = new Set(); // no selectors to match too.

	/**
	* Register a Module callback with an Event
	* @param {May} map - for each EventListener
	* @param {String} CSS selector to match
	* @param {Function} callback 
	*/
	const addListener = ( map, selector, cb ) => {
		
		if( map.has( selector )){
			throw new TypeError('Event Delegation: selector already added : ' + selector); 
		} 
		
		map.set( selector, cb );
	};

	/**
	* When Event fires check for registered listeners	
	* @param {Event} - event
	* @param {Map} - listeners
	*/
	const notifyListeners = ( event, listeners ) => {
		/*
		All mousedown, mouseenter, mouseleave events
		must be register here, therefore, there is no need to 
		let them continue to propagate throught the DOM.
		*/
		if( urlHostName === 'mac-oe' || urlHostName === 'idg.knowego.com' ){
			/*
			However, as this stops ALL: mousedown, mouseenter, mouseleave (& touchstart) events.
			Only do this on IDG for now, maybe in the future, it can be added into production...
			*/
			// event.stopPropagation(); 
		}
		
		// who?
		const target = event.target;
		
		// ignore if document
		if( target === document ) return false;
		
		listeners.forEach(( cb, key ) => {
			if( target.matches( key )){
				cb( event );
			}
		});
	};

	/**
	* Throttle Resize Event	
	*/
	const resizeThrottle = (() => {
		
		let throttleID = 0;
		
		const delay = () => {
			clearTimeout(throttleID);
			throttleID = setTimeout( () => {
				resize.forEach( ( cb ) => {
					cb();
				});
			}, 150);
		};
		
		// public
		return { delay };
	})();
	
	// Throttle high rate events
	window.onresize = () => resizeThrottle.delay();
	
	/**
	* Event handlers
	* Specific functions for each event, this is so that they can be removed on Touch
	*/
	
	function handleMouserEnter(e){
		notifyListeners( e, mouseEnter );
	}
	
	function handleMouserDown(e){
		notifyListeners( e, mouseDown );
	}
	
	function handleMouserLeave(e){
		notifyListeners( e, mouseLeave );
	}
	
	/*
	With touch I'll get: touchstart, mouseenter then mousedown.
	This messes up the UI because of "mouseEnter" enhancment behaviour for mouse/track users.
	*/
	let handleTouchStart = ( e ) => {
		// remove mouse events
		document.removeEventListener('mouseenter', handleMouserEnter, { capture:true });
		document.removeEventListener('mousedown', handleMouserDown, { capture:true }); 
		document.removeEventListener('mouseleave', handleMouserLeave, { capture:true });
		
		// run basic "click" behaviour
		notifyListeners( e, mouseDown );
		
		// lazy load - only need the removeListeners once...
		handleTouchStart = ( e ) => {
			notifyListeners( e, mouseDown );
		};
	};
	
	/**
	* Event Listeners
	*/
	document.addEventListener('mouseenter', handleMouserEnter, { capture:true });
	document.addEventListener('mousedown', handleMouserDown, { capture:true }); 
	document.addEventListener('mouseleave', handleMouserLeave, { capture:true });
	document.addEventListener('touchstart', ( e ) => handleTouchStart( e ), { capture:true });
	document.addEventListener('click', ( e ) => notifyListeners( e, click ), { capture:true });

	// extend App
	bj.extend('userEnter', ( selector, cb ) => addListener( mouseEnter, selector, cb ));
	bj.extend('userDown', ( selector, cb ) => addListener( mouseDown, selector, cb ));
	bj.extend('userLeave', ( selector, cb ) => addListener( mouseLeave, selector, cb ));
	bj.extend('userClick', ( selector, cb ) => addListener( click, selector, cb ));
	
	// window resize, no need for selectors
	bj.extend('listenForResize', ( cb ) => resize.add( cb ));

})( bluejay );
/**
* Helper functions
*/
(function( bj ) {

	'use strict';
	
	/**
	* NodeList.forEach has poor support, convert to Array
	* @param {NodeList} nl
	* @returns {Array}
	*/
	const NodeListToArray = (nl) => {
		return Array.prototype.slice.call(nl);
	};
	
	/**
	* Find an element
	* @param {String} selector  	
	* @param {DOMElement} base - base Element for search (optional)
	*/
	const find = ( selector, base ) => ( base || document ).querySelector( selector );
	
	/**
	* Remove a DOM Element 	
	* @param {DOM Element} el
	*/
	const remove = ( el ) => {
		el.parentNode.removeChild( el );
	};
	
	/**
	* <div> with className, this is so common made it easier
	* @param {String} className
	* @param {DOMString} html
	* @returns {Element} <div>
	*/
	const div = ( className, html = false ) => {
		const div = document.createElement('div');
		div.className = className;
		if( html ) div.innerHTML = html;
		return div;
	};
	
	/**
	* param {String} domElement
	* @param {String} className
	* @param {DOMString} html
	* @returns {Element} new DOM
	*/
	const dom = ( domElement, className, html = false ) => {
		const el = document.createElement( domElement );
		el.className = className;
		if( html ) el.innerHTML = html;
		return el;
	};
	
	/**
	* wrap an element (https://plainjs.com/)
	* @param {Element} elementToWrap
	* @param {String} wrapClassName (optional)
	* @returns {Element} new wrapper 
	*/
	const wrap = ( el, wrapClassName = '' ) => {
		const wrap = document.createElement('div');
		/*
		match it's CSS width
		*/
		const compStyles = window.getComputedStyle( el );
		wrap.style.width = compStyles.getPropertyValue('width'); // match wrapped el
		wrap.style.position = "relative";
		wrap.style.display = "inline-block"; // don't affect layout
		
		el.style.width = "100%"; // fill wrapper: "unwrap" reverses this
		
		el.parentNode.insertBefore( wrap, el );
		wrap.appendChild( el ); // now move input into wrap
		
		return wrap;
	};
	
	/**
	* unwrap an element (https://plainjs.com/)
	* @param {Element} unwrapElement
	*/
	const unwrap = ( el ) => {
		const wrap = el.parentNode;
		const parent = wrap.parentNode;
		// clean up and reset the DOM
		el.style.width = ""; // see "wrap" above
		parent.insertBefore( el, wrap );
		remove( wrap ); 
	};
	
	/**
	* Show a DOM Element, the default setting of '' will allow the
	* the CSS to be used and stop the inline style overwriting it
	* @param {DOM Element} el
	* @param {String} displayType - "block","flex",'table-row',etc
	*/
	const show = ( el, displayType = '') => {
		if( el === null ) return;
		el.style.display = displayType;
	};
	
	/**
	* ! - DEPRECIATED
	* re-show a DOM Element - this assumes CSS has set display: "block" || "flex" || "inline-block" (or whatever)
	* @param {DOM Element} el
	*/
	const reshow = ( el ) => {
		if(el === null) return;
		el.style.display = ""; // in which case remove the style display and let the CSS handle it again (thanks Mike)
	};
	
	/**
	* Hide a DOM Element ()	
	* @param {DOM Element} el
	*/
	const hide = ( el ) => {
		if( el === null ) return;
		el.style.display = "none";
	};
	
	/**
	* clearContents
	* some discussion over this, this 'seems' a good approach and is faster than innerHTML
	* however, might have problems with <SVG> nodes. May need a removeChild() approach.
	* @param {DOM Element} el
	*/
	const clearContent = ( parentNode ) => {
		if( parentNode.firstChild ){ 
			parentNode.textContent = null;	
		}
	};
	
	/**
	* getParent - search UP the DOM (restrict to body) 
	* @param {HTMLElement} el
	* @parent {String} string to match
	* @returns {HTMLElement} or False
	*/
	const getParent = ( el, selector ) => {
		while( !el.matches('body')){
			if( el.matches( selector )){
				return el; // found it!
			} else {
				el = el.parentNode; // keep looking...
			}
		}
		return false;
	};
	
	/**
	* XMLHttpRequest 
	* @param {string} url
	* @param {string} token - returned in Promise for crosschecking
	* @returns {Promise} resolve(responseText) or reject(errorMsg)
	*/
	const xhr = ( url, token = false ) => {
		bj.log('[XHR] - ' + url );
		// wrap XHR in Promise
		return new Promise(( resolve, reject ) => {
			let xReq = new XMLHttpRequest();
			xReq.open("GET", url );
			xReq.onreadystatechange = function(){
				
				if(xReq.readyState !== 4) return; // only run if request is fully complete 
				
				if(xReq.status >= 200 && xReq.status < 300){
					bj.log('[XHR] - Success');
					xReq.token = token;
					resolve({ html: xReq.responseText, token });
					// success
				} else {
					// failure
					bj.log('[XHR] - Failed');
					reject(this.status + " " + this.statusText);
				}			
			};
			// open and send request
			xReq.send();
		});
	};
	
	/**
	* Unique tokens, use a generator to always create unique tokens
	* token will always return a unique token
	*/
	function *UniqueToken(){
		let id = 1;
		while( true ){
			++id;
			yield `bj${id}`;
		}
	}
	const tokenIterator = UniqueToken();
	const token = () => tokenIterator.next().value;

	/**
	* Load JS on request. 
	* @param {String} url - external JS file
	* @param {Boolean} crossorigin - used to load CDN JS (... ReactJS for demos)
	* @returns {Promise} resolve(responseText) or reject(errorMsg)
	*/
	const loadJS = ( url, crossorigin=false ) => {
		bj.log('[JS script] - ' + url );
		return new Promise(( resolve, reject ) => {
			const script = document.createElement('script');
		    script.src = url;
			if( crossorigin ){
				script.setAttribute('crossorigin', '');
			}
			/*
			Not bothering with catching errors here at the moment.
			*/
			script.onload = () => {
				setTimeout(() => {
					bj.log('[JS loaded] - ' + url);
					resolve();
				}, 100 ); // delay to allow time to run the JS
			}; 
			script.onerror = () => bj.log('[JS ERROR ] - ' + url );
			document.head.appendChild( script) ;
		});  
	};


	/**
	* Get dimensions of hidden DOM element
	* can only be used on 'fixed' or 'absolute'elements
	* @param {DOM Element} el 	currently out of the document flow
	* @returns {Object} width and height as {w:w,h:h}
	*/
	const getHiddenElemSize = ( el ) => {
		// need to render with all the right CSS being applied
		// displayed but hidden...
		el.style.visibility = 'hidden';
		el.style.display = ''; // this assumes that a display is set on CSS (or by default on the DOM)
			
		// get props...
		let props = {	
			w: el.offsetWidth,
			h: el.offsetHeight 
		}; 	
		
		// ...and hide again
		el.style.visibility = '';
		el.style.display = 'none';
		
		return props;
	};
	
	/** 
	* clock24 - show Date as time (24hr)
	* @param {Date} - Date
	* @returns {String} - e.g. '09:03'
	*/
	const clock24 = ( date ) => {
		return date.getHours().toString().padStart(2,'0')  + ':' + date.getMinutes().toString().padStart(2,'0');
	};
	
	/* 
	* Output messgaes onto UI
	* useful for touch device testing
	* @param {String} Message
	*/  
	const idgMsgReporter = (msg) => {
		
		let id = "idg-js-ui-message-out";
		let ul = document.getElementById(id);
		let li = document.createElement("li");
		
		if(ul === null){
			ul = document.createElement("ul");
			ul.id = id;
			ul.style = "position:fixed; bottom:10px; right:10px; z-index:9999; background:orange; padding:10px; list-style-position:inside; max-height:vh90; overflow-y: scroll; font-size:14px;";
			document.body.appendChild(ul);
		}
	
		let count = ul.children.length; 
		li.appendChild( document.createTextNode(count +' - '+ msg) );
		ul.appendChild(li);
	};
	
	/*
	Extend App
	*/
	bj.extend('nodeArray', NodeListToArray );
	bj.extend('find', find );
	bj.extend('getParent', getParent );
	bj.extend('wrap', wrap );
	bj.extend('unwrap', unwrap );
	bj.extend('div', div);
	bj.extend('dom', dom);
	bj.extend('remove', remove );
	bj.extend('show', show );
	bj.extend('reshow', reshow );
	bj.extend('hide', hide );
	bj.extend('empty', clearContent );
	bj.extend('xhr', xhr );
	bj.extend('getToken', token );
	bj.extend('loadJS', loadJS );
	bj.extend('getHiddenElemSize', getHiddenElemSize );
	bj.extend('idgReporter', idgMsgReporter );
	bj.extend('clock24', clock24 );
	
})( bluejay );
/**
* Modules in bluejay.
* Manage namespacing for modules in blueajay
*/
(function( bj ){
	'use strict';
	
	/* 
	Keep a note of added Modules for debugging
	2 version of Bluejay are created: 
	1) IDG all modules.
	2) OE UI: selected modules.
	*/
	const modules = [];
	const registerModule = ( name ) => modules.push( name );
	const listModules = () => {
		modules.sort();
		return modules.join(', ');
	};
	
	/**
	Manage namespace in Bluejay
	*/
	const namespace = new Map();
	/**
	 * Get/Set Namespace
	 * @param  {String} namespace
	 * @return {Object} (namespace)
	 */
	const appNameSpace = ( name ) => {
		if( !namespace.has( name )) namespace.set( name, {} );
		return namespace.get( name );	
	};
	
	// Extend API
	bj.extend( 'addModule', registerModule );
	bj.extend( 'registeredModules', listModules );
	bj.extend( 'namespace', appNameSpace );

})( bluejay );
/**
* Template structure for MV* patterns 
* Observer pattern
*/
(function( bj ) {
	
	'use strict';
	
	/**
	* Create an ObserverList for Models (Models)
	*/	
	const ObserverList = () => ({
		list: new Set(), // observer only needs (should) be added once
		add( item ){
			this.list.add( item );
			return this.list.has( item );
		}, 
		remove( item ){
			this.list.remove( item );
		}, 
		size(){
			return this.list.size;
		}, 
		notify(){
			let iterator = this.list.values();
			for ( let item of iterator ){
				item();
			}
		}
	});
	 
	/**
	* Basic Model with Observer Pattern for Views
	*/
	const Model = () => ({
		views: Object.create( ObserverList() )
	});
		
	bj.extend( 'ModelViews', Model );	

})( bluejay );
/**
* Settings (useful globals)
*/
(function( bj ){

	'use strict';
	
	/**
	* Globally useful settings.
	* CSS setting MUST match newblue: openeyes/__config-all.scss
	* @param {String} setting request
	* @returns value || null
	*/ 
	const settings = ( request ) => {
		switch( request ){
			case "cssHeaderHeight": return 60; // mobile portrait, this doubles up! 
			case "cssExtended": return 1440;
			case "cssHotlistFixed": return 1890;
			case "idgPHPLoadURL": return '/idg-php/v3/_load/';
			default:
				bj.log('Setting request not recognised: ' + request);
				return null;
		}
	};
	
	/**
	* Global window width & height. 
	* As these force reflow, only update onResize
	* then make available to the app.
	*/
	let w = window.innerWidth;
	let h = window.innerHeight;
	
	const windowSize = () => {
		w = window.innerWidth;
		h = window.innerHeight;
	};
	
	// make available to blueJS modules
	const getWinH = () => h;
	const getWinW = () => w;
	
	// update
	bj.listenForResize( windowSize );

	
	/**
	* Standardise data-attributes names
	* @param {String} suffix optional
	* @returns {Sting} 
	*/
	const domDataAttribute = (suffix = false) => {
		let attr = !suffix ? 'bluejay' : 'bluejay-' + suffix;
		return 'data-' + attr;
	};
	
	/**
	* set Data Attribute on DOM 
	* @param {HTMLElement} el - el to store on
	* @param {String} value
	*/
	const setDataAttr = (el, value) => {
		el.setAttribute(domDataAttribute(), value); 
	};
	
	/**
	* get Data Attribute on DOM 
	* @param {HTMLElement} el - el to check
	* @returns {String||null} 
	*/
	const getDataAttr = (el) => {
		const dataAttr = domDataAttribute();
		if(el.hasAttribute(dataAttr)){
			return el.getAttribute(dataAttr);
		} else { 
			return false;
		}
	};

	// Extend App
	bj.extend('settings', settings);
	bj.extend('getWinH', getWinH );
	bj.extend('getWinW', getWinW );
	bj.extend('getDataAttributeName', domDataAttribute);
	bj.extend('setDataAttr', setDataAttr);
	bj.extend('getDataAttr', getDataAttr);


})( bluejay );
(function( bj ){

	'use strict';	
	
	bj.addModule('collapseExpand');
	
	/*
	Collapse and Expanding data is a common UI pattern
	Initially I approached this with "data", I then used 'group'
	Both are supported:
	
	.collapse-data
	|- .collapse-data-header-icon (expand/collapse)
	|- .collapse-data-content
	
	.collapse-group
	|- .header-icon (expand/collapse)
	|- .collapse-group-content
	
	Hotlist also required this but needed it's own styling:
	.collapse-hotlist
	|- .header-icon (expand/collapse)
	|- .collapse-group-content
	
	*/
	const collection = new bj.Collection();

	/*
	Methods	
	*/
	const _change = () => ({
		change: function(){
			if( this.open )	this.hide();
			else			this.show();
		}
	});
	
	const _show = () => ({
		show: function(){
			bj.show( this.content, "block" );
			this.btn.classList.replace('expand','collapse');
			this.open = true;
		}
	});
	
	const _hide = () => ({
		hide: function(){
			bj.hide( this.content );
			this.btn.classList.replace('collapse','expand');
			this.open = false;
		}
	});
	
	/**
	* @Class
	* @param {Object} me - initialise
	* @returns new Object
	*/
	const Expander = (me) => Object.assign( me, _change(), _show(), _hide());

	/**
	* Callback for 'Click' (header btn)
	* @param {event} event
	*/
	const userClick = (ev, type) => {
		let btn = ev.target;
		let key = collection.getKey( btn );
		let expander;
		
		if( key ){
			// already setup
			expander = collection.get( key );
		} else {
			/*
			Data/Group are generally collapsed by default
			but might be setup in the DOM to be expanded, check btn class to see
			*/
			// create new Expander
			expander = Expander({
				btn: btn,
				content: bj.find('.collapse-' + type + '-content', btn.parentNode ),
				open: btn.classList.contains('collapse') // inital state
			});
	
			// update collection 	
			collection.add( expander, btn );	
		}
		
		// either way it's a click...
		expander.change(); 
	
	};

	/*
	Events
	*/
	bj.userDown( ".collapse-data-header-icon", ev => userClick( ev, "data"));
	bj.userDown( ".collapse-group > .header-icon", ev => userClick( ev, "group"));
	bj.userDown( ".collapse-hotlist > .header-icon", ev => userClick( ev, "hotlist"));

})( bluejay ); 
(function( bj ) {

	'use strict';	
	
	bj.addModule('comments');	

	/**
	Comments icon is clicked on to reveal 
	comments input field. Either:
	1) Textarea switches places with icon button
	2) Textarea is shown in different DOM placement  
	
	update: 
	New Diagnosis Element need comments for both sides
	see: Ophthalmic & Systemic Diagnosis EDIT
	**/
	
	const userClick = (ev) => {
		const btn = ev.target;
		const json = JSON.parse(btn.dataset.idgdemo);
		
		bj.hide( btn );
		
		if(json.bilateral){
			// Find 2 comment inputs (I assume suffix of "-left" & '-right')
			const commentsR = document.querySelector('#' + json.id + '-right');
			const commentsL = document.querySelector('#' + json.id + '-left');
			
			bj.show( commentsR, 'block');
			bj.show( commentsL, 'block');
			
			commentsR.querySelector('.js-remove-add-comments').addEventListener('mousedown', () => {
				bj.show( btn );
				bj.hide( commentsR );
				bj.hide( commentsL );
			}, { once:true });
			
			commentsL.querySelector('.js-remove-add-comments').addEventListener('mousedown', () => {
				bj.show( btn );
				bj.hide( commentsR );
				bj.hide( commentsL );
			}, { once:true });
				
		} else {
			// single comment input
			const comments = document.querySelector('#' + json.id);
			bj.show( comments, 'block' );
			comments.querySelector('textarea').focus();
			comments.querySelector('.js-remove-add-comments').addEventListener('mousedown', () => {
				bj.show( btn );
				bj.hide( comments );
			},{ once:true });	
		}
	};
	
	bj.userDown('.js-add-comments', userClick );
	
})( bluejay ); 
(function( bj ) {
	'use strict';	
	
	bj.addModule('commentHotlist');	

	// DOM collection
	const collection = new bj.Collection();
	
	/**
	* Methods
	*/
	const _reset = () => ({
		/**
		* VIEW: Reset the comment. 
		*/
		reset(){
			this.editMode = false;
			this.icon('comment');
			bj.hide( this.elem.textarea );
			bj.hide( this.elem.userComment );
		}
	});
	
	const _show = () => ({
		/**
		* VIEW: Show the comment. 
		*/
		show(){
			this.editMode = false;
			this.icon('edit');
			/*
			Show the comment text back to User. 
			Need to style offical qtags. 
			bj.wrapQtags() returns {
				text: {Basic string, tags are re-organsied}
				DOMString: {DOMstring, qtags are organised and styled}
			}
			*/
			let wrapQtags = bj.wrapQtags( this.comment );
			this.elem.userComment.innerHTML = wrapQtags.DOMString;
			
			this.comment = wrapQtags.text;
			
			bj.hide( this.elem.textarea );
			bj.show( this.elem.userComment, 'block' );
		}
	});
	
	const _edit = () => ({
		/**
		* VIEW: Edit the comment. 
		*/
		edit(){
			this.editMode = true;
			this.icon('save');
			bj.show( this.elem.textarea, 'block' );
			bj.hide( this.elem.userComment );
			
			// set the comment text
			this.elem.textarea.value = this.comment;
			
			// check the resize
			bj.resizeTextArea( this.elem.textarea );
			
			// and set focus for cursor
			setTimeout( () => this.elem.textarea.focus() , 20);
			
			/*
			Allow user to update comments with an Enter press
			(alternative to icon click)
			*/
			const keyPress = ( ev ) => {
				if( ev.key === "Enter" ){
					ev.preventDefault();
					ev.stopPropagation();
					this.update();
					this.elem.textarea.removeEventListener("keydown", keyPress, false );
				}
			};
			// must match the removeEventListener.
			this.elem.textarea.addEventListener("keydown", keyPress, false );				
		}
	});
	
	const _icon = () => ({
		/**
		* VIEW: Icon state. 
		*/
		icon( state ){
			this.elem.icon.classList.remove('comments', 'comments-added', 'save', 'active');
			switch( state ){
				case 'comment': this.elem.icon.classList.add('comments');
				break;
				case 'edit': this.elem.icon.classList.add('comments-added');
				break;
				case 'save': this.elem.icon.classList.add('save', 'active');
				break;
				
				default: bj.log(`commentHotlist - unknown icon: ${state}`);
			}
		}
	});
	
	
	const _userClick = () => ({
		/**
		* Clicking icon can only have two options
		*/
		userClick(){
			// icon clicked, update based on current state
			if( this.editMode ){
				this.update();
			} else {
				this.edit();
			}
		}
	});
	
	const _update = () => ({
		/**
		* Update the comment text and the state depending 
		* the text... if it's an empty string then reset
		*/
		update(){
			let text = this.elem.textarea.value.trim();
			if( text.length ){
				this.comment = text;
				this.show();
			} else {
				this.comment = "";
				this.reset();
			}
		}
	});
	

	/**
	* @Class 
	* @param {Element} icon
	* @param {Element} <td>
	* @param {String} comments to initalise template with.
	* @returns new Object
	*/
	const PatientComment = ( icon, td, comment = "" ) => {
		// Mustache template
		const template = [
			'<textarea placeholder="Comments" rows="1" class="cols-full js-allow-qtags" style="display:none"></textarea>',
			'<div class="user-comment" style="display:none">{{comment}}</div>',
		].join('');
		
		/*
		Initalise the DOM for comments
		*/
		let div = document.createElement('div');
		div.className = 'patient-comments';
		div.innerHTML = Mustache.render( template, { comment:  comment });
		td.appendChild( div );
		
		// get the new Elements
		let textarea = div.querySelector('textarea');
		let userComment = div.querySelector('.user-comment');
		
		return Object.assign({ 
				editMode: false,
				comment,
				elem: { 
					icon, textarea, userComment 
				}
			},
			_reset(),
			_show(),
			_edit(), 
			_icon(),
			_userClick(),
			_update()
		);
	};
	
	
	/**
	* Callback for Event (header btn)
	* @param {event} event
	*/
	const userClick = (ev) => {
		const icon = ev.target;
		let key = collection.getKey( icon );
		
		if( key ){
			let patientComment = collection.get( key );
			patientComment.userClick();
		} else {
			// Not Setup.
			let tr = bj.getParent(icon, 'tr');
			let td = tr.querySelector('.js-patient-comment');
			let patientComment = PatientComment( icon, td );
			patientComment.edit(); // user clicked on comment icon

			// update collection 	
			collection.add( patientComment, icon );	
		}		
	};

	bj.userDown('.oe-hotlist-panel .js-comment-icon', userClick);
	
	
	/**
	* Check to see if PHP static comments are added 
	* if so initalise them, but need to wait to make 
	* available the qtags wrapper
	*/
	document.addEventListener('DOMContentLoaded', () => {
		
		let hotlistPatients = bj.nodeArray( document.querySelectorAll( '.oe-hotlist-panel .activity-list tr' ));
	
		hotlistPatients.forEach( (tr) => {
			if ( tr.hasAttribute("data-comment") ){
				let json = JSON.parse( tr.dataset.comment );
				if( json.comment ){
					let icon = tr.querySelector('.oe-i.comments');
					let td = tr.querySelector('.js-patient-comment');
					let patientComment = PatientComment( icon, td, json.comment );
					patientComment.show();
					
					// init and record Key
					collection.add( patientComment, icon );
				}	
			}
			
		});
		
	}, { once: true });
	
})( bluejay ); 

(function( bj ) {

	'use strict';
	
	bj.addModule('copyToClipboard');
	
	/**
	current: "js-copy-to-clipboard"
	new: "js-clipboard-copy"
	*/
	
	const selector = '.js-clipboard-copy';
	
	if( document.querySelector( selector ) === null ) return;
	
	/*
	Added to the hospital number and nhs number, provide a UI clue	
	*/
	const all = bj.nodeArray( document.querySelectorAll( selector ));
	all.forEach( ( elem )=>{
		elem.style.cursor = "copy";	
	});
	
	/**
	* Copy success!
	* @param {Element} elem - <span>
	*/
	const success = ( elem ) => {
		
		let domRect = elem.getBoundingClientRect();
		let center = domRect.right - (domRect.width/2);
		let top = domRect.top - 5;
		let tipHeight = 30;
		
		const div = document.createElement( 'div' );
		div.className = "oe-tooltip fade-out copied";
		div.innerHTML = 'Copied';
		div.style.width = '80px'; // overide the newblue CSS
		div.style.top = ( top - tipHeight )+ 'px';
		div.style.left = ( center - 40 ) + 'px';
		
		document.body.appendChild( div );
		
		setTimeout(() => bj.remove( div ) , 2500 ); // CSS fade out takes 2 secs.
	};
	

	/**
	* Use the clipboard API (if available)
	* @param {Element} elem - <span>
	*/
	const copyToClipboard = ( elem ) => {
		/*
		Note that the API only works when served over secured domains (https) 
		or localhost and when the page is the browser's currently active tab.
		*/
		if(navigator.clipboard){
			// if availabld use ASYNC new API
			navigator.clipboard.writeText( elem.textContent )
				.then(() => {
					bj.log('[ASYNC] copied text to clipboard');
					success( elem );
				})
				.catch(err => {
					bj.log('failed to copy text to clipboard');
				});
		} else {
			// or use the old skool method
			const input = document.createElement('input');
			input.value = elem.textContent;
			input.style.position = "absolute";
			input.style.top = '-200px';
			
			document.body.appendChild( input );
			
			input.select();
	
			document.execCommand("copy");
			
			success( elem );
			
			// clean up DOM
			bj.remove( input );
		}		
	};
	
	/*
	Events
	*/
	
	bj.userDown( selector, ( ev ) => copyToClipboard( ev.target ));
		
})( bluejay ); 
(function (uiApp) {

	'use strict';
	
	uiApp.addModule('elementTiles');
	
	/*
	Tile Elements
	As a row they can be collapsed
	They are also height restricted and if data
	overflows this needs flagging using "restrictDataFlag"
	*/
	
	const states = [];
	
	/*
	DOM
	- element-tile-group
	-- element view tile
	--- element-data
	---- tile-data-overflow (CSS set at max-height 160px)
	-- collapse-tile-group
	*/
	
	/*
	Methods	
	*/
	const _showTile = () => ({
		/**
		* Show the tile content (data)
		*/
		show: function(){
			this.h3.textContent = this.title;
			uiApp.show(this.content, 'block');
		}
	});
	
	const _hideTile = () => ({
		/**
		* Hide the tile content (data)
		*/
		hide: function(){
			this.h3.innerHTML = this.title + " <small>["+ this.count +"]</small>";
			uiApp.hide(this.content);
		}
	});

	/**
	* @Class 
	* @param {Node} .element
	* @returns new Object
	*/
	const Tile = (el) => {
		// set up Tile
		const	h3 = el.querySelector('.element-title'),
				title = h3.textContent,
				content = el.querySelector('.element-data'),
				dataRows = content.querySelectorAll('tbody tr').length;
	
		return Object.assign(	{	h3: h3,
									title: title,
									content: content,
									count: dataRows.toString(),
								},
								_showTile(),
								_hideTile() );
	};
	
	/*
	Methods	
	*/
	const _changeGroup = () => ({
		/**
		* Change the group state (Expand or Collapse)
		*/
		change:function(){
			this.tiles.forEach((tile) => {
				if(this.collapsed){
					this.btn.classList.replace('increase-height','reduce-height');
					tile.show();
				} else {
					this.btn.classList.replace('reduce-height','increase-height');
					tile.hide();
				}
			});
			
			this.collapsed = !this.collapsed;
		}
	});
	
	const _addTile = () => ({
		/**
		* addTile
		* @param {Tile} tile - instanceOf Tile
		*/
		addTile:function(tile){
			this.tiles.push(tile);
		}
	});
	
	/**
	* @Class 
	* @param {Node} .element-tile-group
	* @returns new Object
	*/
	const Group = (btn) => {
		return Object.assign({ 	tiles:[],
								btn:btn,
								collapsed:false,
							},
							_addTile(),
							_changeGroup() );
	};
	
	
	/*
	Events
	*/	
	const userClick = (ev) => {
		let parent = uiApp.getParent(ev.target, '.element-tile-group');
		let dataAttr = uiApp.getDataAttr(parent);
		
		if(dataAttr){
			/*
			Setup already, change it's state
			*/
			states[parseFloat(dataAttr)].change();
		} else {
			/*
			No DOM attribute, needs setting up
			note: it's been clicked! 
			*/
			let group = Group(ev.target);
			// get all Tile Elements in groups
			let elements = uiApp.nodeArray(parent.querySelectorAll('.element.tile'));
			elements.forEach((item) => {
				group.addTile(Tile(item));
			});
			
			group.change(); 	// a click! so change
			uiApp.setDataAttr(parent, states.length);
			states.push(group); // store new state	
		}
		
	};
	

	// Regsiter for Events
	uiApp.userDown('.collapse-tile-group .oe-i', userClick);
	
	
})(bluejay); 

(function( bj ) {
	'use strict';	
	
	bj.addModule('fastDatePicker');	

	/*
	values in milliseconds 
	remember: server timestamps PHP work in seconds
	*/
	const now = Date.now(); // should we be using a Server timestamp?
	const today = new Date( now );

	/** 
	* Model - extended with MV views
	*/	
	const model = Object.assign({ 
		pickDate:null, 	// currently picked date
		inputDate:null, // if a valid date already exists in <input>
	
		get date(){
			return this.pickDate;
		}, 
		set date( val ){
			this.pickDate = val;
			this.views.notify();	
		}, 
		get userDate(){
			if( this.inputDate == null ) return false;
			return this.inputDate;
		},
		set userDate( val ){
			this.inputDate = val;
		},
		changeMonth( n ){
			this.pickDate.setMonth( n );
			this.views.notify();
		},
		
		changeFullYear( n ){
			this.pickDate.setFullYear( n );	
			this.views.notify();	
		}
	}, bj.ModelViews());

	
	/**
	* Date grid - calendar of dates in weekly grid
	*/
	const dateGrid = (() => {
		let div;
		/**
		* Reset (ready for next date)
		*/
		const reset = () => {
			div = null;
		};
		
		/**
		* Build DOM, and pre-fill grid with blanks
		* @param {Element} wrap - main <div>
		*/
		const build = ( wrap ) => {
			div = bj.div("date-grid");
			div.innerHTML = Mustache.render( '{{#divs}}<div class="prev">{{.}}</div>{{/divs}}', { divs: new Array(42).fill('') });
			wrap.appendChild( div );
		};
		
		/**
		* Flag a date in the grid 
		* @param {Date} mydate
		* @param {String} className
		*/
		const flagDate = ( mydate, className ) => {
			if( mydate.getMonth() == model.date.getMonth() && 
				mydate.getFullYear() == model.date.getFullYear()){
				
				// flag date in UI
				const dateDiv = div.querySelector('#js-fast-date-' + mydate.getDate());
				dateDiv.classList.add( className ); 
			}
		};
		
		/**
		* Observer the model. 
		* Build the date grid based on the current picked Date
		*/
		const dates = () => {
			const 
				y = model.date.getFullYear(),
				m = model.date.getMonth(), 
				mthStartDay = new Date(y, m, 1).getDay(),
				mthLastDate = new Date(y, m +1, 0).getDate(),
				prevEndDate = new Date(y, m, 0).getDate(),
				prev = [],
				current = [],
				next = [];
				
			// in JS sundays start the week (0), re-adjust to a Monday start
			let startDay = mthStartDay ? mthStartDay : 7;	
				 
			// Previous month dates to fill first week line to the start day of current month
			for( let i = startDay-1, j = prevEndDate; i > 0; i--, j-- ) prev.push( j );
			
			// Current Month dates
			for( let i = 1; i <= mthLastDate; i++ ) current.push( i );
			
			// Next Month dates fill remaining spaces - date grid is 7 x 6 (42)
			const fillDays = 42 - (prev.length + current.length);
			for( let i = 1; i <= fillDays; i++ ) next.push( i );
			
			// order previous dates correctly
			prev.reverse(); 
				
			// build DOM
			const datesPrev = Mustache.render( '{{#prev}}<div class="prev">{{.}}</div>{{/prev}}', { prev });
			const datesCurrent = Mustache.render( '{{#current}}<div id="js-fast-date-{{.}}">{{.}}</div>{{/current}}', { current });
			const datesNext = Mustache.render( '{{#next}}<div class="next">{{.}}</div>{{/next}}', { next });
			
			div.innerHTML = datesPrev + datesCurrent + datesNext;
			
			// flag today 
			flagDate( today, 'today' );
			
			// if there is valid user date...
			if( model.userDate != false ) flagDate( model.userDate, 'selected' );
		};
		
		// add to observers
		model.views.add( dates );
		
		// public
		return { reset, build };
		
	})();
	
	/**
	* Months
	*/
	const month = (() => {
		const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
		let div, active;
		
		/**
		* Reset (ready for next date)
		*/
		const reset = () => {
			div = null;
			active = null;
		};
		
		/**
		* Build DOM
		* @param {Element} wrap - main <div>
		*/
		const build = ( wrap ) => {
			div = bj.div("month");
			div.innerHTML = Mustache.render( '{{#months}}<div>{{.}}</div>{{/months}}', { months });
			wrap.appendChild( div );
		};
		
		/**
		* Picker needs to find the month number from the btn name
		* @param {String} mthStr - e.g. 'Jan'
		* @returns {Number}
		*/
		const getMonthNum = ( mthStr ) =>  months.indexOf( mthStr );
		
		/**
		* Picker needs to know the month name
		* @param {Number} n 
		* @returns {String}
		*/
		const getMonthName = ( n ) =>  months[ n ];
		
		/**
		* Update DOM to show selected Month
		*/
		const update = () => {
			const mth = div.children[ model.date.getMonth() ];
			if( active ) active.classList.remove('selected');
			mth.classList.add('selected');
			active = mth;
		};
		
		// add to observers
		model.views.add( update );
		
		return { reset, build, getMonthNum, getMonthName };
		
	})();
	
	/**
	* Year
	* @returns API
	*/
	const year = (() => {
		let div, nodes, yearList;
		let slideYears = false;
		
		/**
		* Reset (ready for next date)
		*/
		const reset = () => {
			div = null;
			nodes = null;
			yearList = null;
			slideYears = false;
		};

		/**
		* Build DOM
		* @param {Element} wrap - main <div>
		*/
		const build = ( wrap ) => {
			const template = [
				'<div class="century">{{#century}}<div>{{.}}</div>{{/century}}</div>',
				// '<ul class="decade">{{#ten}}<li>{{.}}</li>{{/ten}}</ul>',
				'<ul class="years">{{#years}}<li>{{.}}</li>{{/years}}</ul>',
			].join('');

			//const ten = Array.from( Array(10).keys() ); // 0 - 9
			const hundred = Array.from( Array(100).keys() ); // 0 - 99;
			const years = hundred.map( x => x < 10 ? `0${x}` : x );
			
			div = bj.div("year");
			div.innerHTML = Mustache.render( template, { century: ['19', '20'], years });
			
			yearList = div.querySelector('.years');
			
			// store reference to nodelists (should be OK, use Array.from otherwise)
			nodes = {
				c: div.querySelector('.century').childNodes, 
				//d: div.querySelector('.decade').childNodes,
				y: yearList.childNodes,
			};
			
			wrap.append( div );
			
		};
		
		/**
		* Years need to used in centuries, decades and single years
		* @retures {Object} year units
		*/
		const getYearUnits = () => {
			const fullYear =  model.date.getFullYear();
			return {
				c: Math.floor( fullYear / 100 ),
				//d: parseFloat( fullYear.toString().charAt(2) ),
				y: parseFloat( fullYear.toString().substring(2))
			};
			
			
		};
		
		/**
		* Update DOM to show selected Year
		*/
		const update = () => {
			const yr = getYearUnits();
			
			// convert '19' and '20' century to UI nodelist places
			yr.c = yr.c == 20 ? 1 : 0; 

			nodes.c.forEach((n) => n.classList.remove('selected'));
			//nodes.d.forEach((n) => n.classList.remove('selected'));
			nodes.y.forEach((n) => n.classList.remove('selected'));
		
			nodes.c[ yr.c ].classList.add('selected');
			//nodes.d[ yr.d ].classList.add('selected');
			nodes.y[ yr.y ].classList.add('selected');
			
			// and center scrolling years (based on CSS height settings)

			yearList.scrollTo({
			  top: (yr.y * 38.5) - 95,
			  left: 0,
			  behavior: slideYears ? 'smooth' : 'auto' // first time jump to position
			});
			
			slideYears = true;
		};
		
		
		// add to observers
		model.views.add( update );
		
		return { reset, build, getYearUnits };
		
	})();
	
	
	/**
	* Picker (controller)
	*/
	const picker = (() => {
		let input, div;
		/*
		Using 'blur' event to remove picker popup. But if user 
		clicks on a picker date this needs to be ignored
		*/
		let ignoreBlurEvent = false;
		
		/**
		* Remove and reset
		* Either called directly when user selects a Date or by 'blur'
		* Or by 'blur' event
		*/
		const remove = () => {
			/*
			If part of an Event chain from Month 
			or Year change then ignore this	'blur' request
			*/
			if( ignoreBlurEvent ){
				ignoreBlurEvent = false;
				input.focus(); // instantly return focus so that we can use 'blur'
				return;
			}
			
			// help JS with GC
			dateGrid.reset();
			month.reset();
			year.reset();
			
			// clean up and reset 
			document.removeEventListener('blur', picker.remove, { capture: true });
			//window.removeEventListener('scroll', picker.remove, { capture:true, once:true });
			bj.remove( div );
			div = null;
			input = null;
		};
		
		/**
		* initCalender when DOM is built.
		* check <input> for a valid or use 'today'
		*/
		const initCalendar = () => {
			let timeStamp;
			let validUserInputDate = false;
			
			// <input> - test for valid date format: '1 Jan 1970' pattern
			if( input.value ){
				if( /^\d{1,2} [a-z]{3} \d{4}/i.test( input.value )){
					timeStamp = Date.parse( input.value ); 
					if( !isNaN( timeStamp )){
						/*
						Seems valid, but is it reasonable?
						it could be '1 Jan 2328', check within year range
						*/
						const userDate = new Date( timeStamp );
						const userFullYear = userDate.getFullYear();
						if( userFullYear > 1900 && userFullYear < 2099 ){
							validUserInputDate = userDate;
						} 
					}
				}
			}
			
			// set up Model with Date 
			if( validUserInputDate ){
				model.userDate = validUserInputDate;
				model.date = new Date( timeStamp ); // note: this will trigger Views notifications, must be set last!
			} else {
				model.date = new Date( now );
			}
		};
		
		/**
		* Show Fast Date picker - callback from 'focus' event
		* @param {Element} el - event.target (input.date)
		*/
		const show = ( el ) => {
			/*
			Note: refocusing on the input, after ignoring a blur event
			will trigger the input event again, ignore this	
			*/
			if( el.isSameNode( input )) return;

			// OK new <input>
			input = el;
	
			/*
			CSS height and width is fixed. 	
			Default position is below, left (follows Pick me up)
			*/
			const h = 240;
			const w = 430;
			const rect = input.getBoundingClientRect();
			
			div = bj.div("fast-date-picker");
			div.style.left = (rect.right - w ) + 'px';
			div.style.top = rect.bottom + 'px';
			
			// check default positioning is available, if not shift position
			if( rect.left < w ) div.style.left = rect.left + 'px';
			if( (rect.bottom + h) > bj.getWinH())	div.style.top = (rect.top - h) + 'px';
			
			
			// build popup elements 
			year.build( div );
			month.build( div );
			dateGrid.build( div );	
			
			
			// show picker
			document.body.appendChild( div );  
			
			// initCalendar (set the Model)
			initCalendar();
							
			// use blur to remove picker
			document.addEventListener('blur', picker.remove, { capture: true });
			//window.addEventListener('scroll', picker.remove, { capture:true, once:true });
		};
		
		/**
		* Callback for Events on Month and Year
		* @param {Element} target - event.target
		* @param {String} unit - unit type
		*/
		const changeDate = ( target, unit ) => {
			/*
			This event will trigger 'blur' must ignore it
			in this Event chain, otherwise it will close picker
			*/
			ignoreBlurEvent = true;
			
			const btnNum = parseFloat( target.textContent );
			const yearParts = year.getYearUnits();
			
			switch( unit ){
				case 'month':
					model.changeMonth( month.getMonthNum( target.textContent )); 
				break;
				
				case 'century': 
					if( btnNum == yearParts.c ) return;
					if( btnNum == 19 ){
						model.changeFullYear( 1999 );
					} else {
						model.changeFullYear( today.getFullYear() );
					}
				break;
/*
				case 'decade':
					let decadeChange = (btnNum - yearParts.d) * 10;
					model.changeFullYear( model.date.getFullYear() + decadeChange );
				break;
*/
				case 'year':
					let yearChange = btnNum - yearParts.y;
					model.changeFullYear( model.date.getFullYear() + yearChange );
				break;
			}
		};
		
		/**
		* oeDate
		* @param {Date} date
		* @returns {String} "dd Mth YYYY"
		*/
		const oeDate = date => date.getDate() + ' ' + month.getMonthName( date.getMonth()) + ' ' + date.getFullYear();
		
		/**
		* Callback for Events on Dates
		* instantly sets the input date value
		* @param {Element} target - event.target
		*/
		const selectDate = ( target ) => {
			const date = parseFloat( target.textContent );
			let m = model.date.getMonth(); 
			
			if( target.classList.contains('prev')){
				model.changeMonth( m - 1 ); // JS handles Year change
			}
			if( target.classList.contains('next')){
				model.changeMonth( m + 1 ); // JS handles Year change
			}
			
			/* 
			Update Model with the selected Date 
			and insert date into input
			*/
			model.date.setDate( date );
			input.value = oeDate( model.date );
			
			remove(); // done! 
		};
		
		// public
		return { show, remove, changeDate, selectDate };
	
	})();
	
	/*
	Events
	*/
	
	document.addEventListener('focus', ( ev ) => {
		if( ev.target.matches('input.date')){
			picker.show( ev.target );
		}
	}, { capture: true });

	bj.userDown('.fast-date-picker .month > div', ev => picker.changeDate( ev.target, 'month' ));
	bj.userDown('.fast-date-picker .century > div', ev => picker.changeDate( ev.target, 'century' ));
	//bj.userDown('.fast-date-picker .decade li', ev => picker.changeDate( ev.target, 'decade' ));
	bj.userDown('.fast-date-picker .years li', ev => picker.changeDate( ev.target, 'year' ));
	bj.userDown('.fast-date-picker .date-grid > div', ev => picker.selectDate( ev.target ));

})( bluejay ); 

(function( bj ) {
	'use strict';	
	
	bj.addModule('fastDateRange');	

	const fastDateRange = document.querySelector('.fast-date-range');
	
	if( fastDateRange == null ) return;
	
	// DOM elements
	const inputTo = document.querySelector('.js-filter-date-to');
	const inputFrom = document.querySelector('.js-filter-date-from');
	const allDates = document.getElementsByName('show-all-date-range')[0]; // nodelist!
	
	/* 
	values in milliseconds 
	remember: server timestamps PHP work in seconds
	*/
	const now = Date.now();
	const today = new Date( now );
	const day = 1000 * 60 * 60 * 24;
	const week = 1000 * 60 * 60 * 24 * 7;
	const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
	
	/**
	* Make oeDate
	* @param {Date} date
	* @returns {String}
	*/
	const oeDate = date => date.getDate() + ' ' + months[ date.getMonth() ] + ' ' + date.getFullYear();

	/**
	* Set the 'to' and 'from' date inputs
	* @param {Date} dateTo
	* @param {Date} dateFrom
	*/
	const setDateRange = ( dateTo, dateFrom ) => {	
		inputTo.value = oeDate( dateTo ); 
		inputFrom.value = oeDate( dateFrom );
		allDates.checked = false; // unclick "all dates"
	};
	
	/**
	* Single day
	* @param {Date} day
	*/
	const singleDay = day => setDateRange( day, day );
	
	/**
	* Week: Mon to Fri
	* @param {Number} weekoffset
	*/
	const weekRange = ( offset ) => {
		let dayNum = today.getDay();
		let monday = now + ( day * (1 - dayNum ));
		let weekStart = monday + ( day * offset);
		setDateRange( new Date( weekStart ), new Date( weekStart + ( day * 4 )));
	};
	
	/**
	* Month
	* @param {Number} monthOffset
	*/
	const monthRange = ( offset ) => {
		let y = today.getFullYear(); 
		let m = today.getMonth() + offset;
		// watch out for year changes
		if( m > 11 ){
			m = 0;
			y = y + 1;
		}
		if( m < 0){
			m = 11; 
			y = y - 1;
		}
		setDateRange( new Date(y, m, 1), new Date(y, m + 1, 0 ));
	};

	/**
	* Handle user event
	* @param {Event} ev (div.range)
	*/
	const userClicks = ( ev ) => {
		const div = ev.target;
		if( !div.hasAttribute('data-range')) return;
		
		const range = div.getAttribute('data-range');
	
		switch( range ){
			case 'yesterday': singleDay( new Date( now - day ));
			break;
			case 'today': singleDay( today );
			break; 
			case 'tomorrow': singleDay( new Date( now + day ));
			break; 
			
			case 'last-week': weekRange( -7 );		
			break;
			case 'this-week': weekRange( 0 );	
			break; 
			case 'next-week': weekRange( 7 );		
			break; 
			
			case 'last-month': monthRange( -1 );
			break; 
			case 'this-month': monthRange( 0 );
			break; 
			case 'next-month': monthRange( +1 );
			break;

			default: bj.log('[fastDateRange] unknown range request: ' +  range );
		}
	};

	/*
	Events	
	*/
	bj.userDown('.fast-date-range .range', userClicks );
		
})( bluejay ); 

(function (uiApp) {

	'use strict';
	
	/*
	To avoid a 'flickering' effect
	DOM elements that need to be 'hidden'
	on page load need to use "hidden" CSS class
	after JS loads it switches it over
	*/ 
	
	const hidden = uiApp.nodeArray(document.querySelectorAll('.hidden'));
	if(hidden.length){
		hidden.forEach( (elem) => {
			uiApp.hide(elem);
			elem.classList.remove('hidden');
		});
	}
	
	// Table rows use a different technique
	const trCollapse = uiApp.nodeArray(document.querySelectorAll('.tr-collapse'));
	if(trCollapse.length){
		trCollapse.forEach( (elem) => {
			elem.style.visibility = 'collapse';
			elem.classList.remove('tr-collapse');
		});
	}
	

	
})(bluejay);
(function (uiApp) {

	'use strict';	
	
	uiApp.addModule('messagePreview');	
	
	/*
	Message hub... view all the message
	*/
	if( document.querySelector('.home-messages') === null ) return;
	
	/*
	Does message need expanding?
	*/
	const msgs = uiApp.nodeArray(document.querySelectorAll('.js-message .message'));
	msgs.forEach((msg) => {
		if( msg.scrollWidth <= msg.clientWidth ){
			// message fits in available space!
			msg.parentNode.nextSibling.querySelector('.js-expand-message').style.display = "none";
		} 
	});
	
	const userClick = (ev) => {
		let icon = ev.target;
		let message = uiApp.getParent(icon,'tr').querySelector('.message');
		if(icon.classList.contains('expand')){
			message.classList.add('expand');
			icon.classList.replace('expand','collapse');
		} else {
			message.classList.remove('expand');
			icon.classList.replace('collapse','expand');
		}		
	};

	/*
	Events
	*/
	uiApp.userDown(	'.js-expand-message',	userClick );

})(bluejay); 
(function( bj ){

	'use strict';	
	
	bj.addModule('navHotlist');
			
	const cssActive = 'active';
	const cssOpen = 'open';
	const selector = '#js-nav-hotlist-btn';
	const wrapper = '#js-hotlist-panel-wrapper';
	const btn = document.querySelector( selector );
	
	if(btn === null) return;
	
	/*
	Methods	
	*/
	
	const _over = () => ({
		/**
		* Callback for 'hover'
		*/
		over: function(){
			if(this.isFixed) return;
			this.btn.classList.add( cssActive );
			this.show();
		}	
	});
	
	const _changeState = () => ({
		/**
		* Callback for 'click'
		* Hotlist can be quickly viewed or 'locked' open
		*/
		changeState:function(){
			if( this.isFixed ) return;
			if( !this.open ){
				this.makeLocked();
				this.over();
			} else {
				if( this.isLocked ){
					this.isLocked = false;
					this.hide();
				} else {
					this.makeLocked();
				}
			}
		}
	});
	
	const _show = () => ({
		/**
		* Show content
		*/
		show:function(){
			if( this.open ) return;
			this.open = true;
			bj.show(this.content, 'block');
		}	
	});
	
	const _hide = () => ({
		/**
		* Hide content
		*/
		hide:function(){
			if( !this.open || this.isLocked || this.isFixed ) return;
			this.open = false;
			this.btn.classList.remove( cssActive, cssOpen );
			bj.hide( this.content );
		}
	});
	
	const _makeLocked = () => ({
		/**
		* 'locked' open if user clicks after opening with 'hover'
		*/
		makeLocked: function(){
			this.isLocked = true; 
			this.btn.classList.add( cssOpen );
		}
	});
	
	const _fixedOpen= () => ({
		/**
		* Automatically 'fixed' open if there is space and it's allowed
		* @param {boolean}
		*/
		fixedOpen: function(b){
			this.isFixed = b; 
			if(b){
				this.isLocked = false;
				this.btn.classList.add( cssOpen );
				this.btn.classList.remove( cssActive );
				this.show();
			} else {
				this.hide();
			}
		}
	});
	
	/**
	* IIFE
	* builds required methods 
	* @returns {Object} 
	*/
	const hotlist = (() => {
		return Object.assign({	
			btn:btn,
			content: document.getElementById('js-hotlist-panel'),
			open: false,
			isLocked: false,
			isFixed: false,
		},
		_changeState(),
		_over(),
		_makeLocked(),
		_show(),
		_hide(),
		_fixedOpen() );
	})();
	
	/*
	Hotlist can be Locked open if: 
	1) The browser is wide enough
	2) The content area allows it (DOM will flag this via data-fixable attribute)
	*/
	const checkBrowserWidth = () => {
		// note: Boolean is actually a string! 
		if(btn.dataset.fixable === "true"){
			hotlist.fixedOpen(( window.innerWidth > bj.settings("cssHotlistFixed" )));
		}
	};
	
	/*
	Events
	*/
	bj.userDown(selector, () => hotlist.changeState());			
	bj.userEnter(selector, () => hotlist.over());
	bj.userLeave( wrapper, () => hotlist.hide());
	
	bj.listenForResize( checkBrowserWidth );
	
	checkBrowserWidth();

})( bluejay ); 
(function ( bj ) {

	'use strict';	
	
	bj.addModule('navLogo');
	
	const cssActive = 'active';
	const cssOpen = 'open';
	const selector = '#js-openeyes-btn';
	const wrapper = '.openeyes-brand';
	
	/**
	Bling.
	Login Page: Flag the logo
	*/
	if(document.querySelector('.oe-login') !== null){
		document.querySelector(selector).classList.add( cssActive );	
	}
	
	/*
	Methods	
	*/
	const _change = () => ({
		/**
		* Callback for 'click'
		*/
		change: function(){
			if(this.open)	this.hide();
			else			this.show();
		}
	});

	const _over = () => ({
		/**
		* Callback for 'hover'
		*/
		over: function(){
			this.btn.classList.add( cssActive );
		}	
	});
	
	const _out = () => ({
		/**
		* Callback for 'exit'
		*/
		out: function(){
			this.btn.classList.remove( cssActive );
		}	
	});

	const _show = () => ({
		/**
		* Show content
		*/
		show:function(){
			if( this.open ) return;
			this.open = true;
			this.btn.classList.add( cssOpen );
			bj.show( this.content, 'block' );
		}	
	});
	
	const _hide = () => ({
		/**
		* Hide content
		*/
		hide:function(){
			if( !this.open ) return;
			this.open = false;
			this.btn.classList.remove( cssOpen, cssActive );
			bj.hide( this.content );			
		}
	});
	
	/**
	* IIFE
	* builds required methods 
	* @returns {Object} 
	*/
	const oelogo = (() => {
		
		return Object.assign({	
			btn: document.querySelector( selector ),
			content: document.querySelector('#js-openeyes-info'),
			open: false
		},
		_over(),
		_out(),
		_change(),
		_show(),
		_hide());
		
	})();
	
	/*
	Events
	*/
	bj.userDown( selector, () => oelogo.change());			
	bj.userEnter( selector, () => oelogo.over());
	bj.userLeave( selector, () => oelogo.out());
	// wrapper
	bj.userLeave( wrapper, () => oelogo.hide());
	
})( bluejay) ; 
(function (uiApp) {

	'use strict';	
	
	uiApp.addModule('notificationBanner');	
	
	if(document.querySelector('#oe-admin-notifcation') === null) return;
	
	const selector = '#oe-admin-notifcation .oe-i';
	const shortInfo = document.querySelector('#notification-short');
	const longInfo = document.querySelector('#notification-full');
	
	/*
	*** Login Page?
	Show the full notification, no interaction!
	*/
	if(document.querySelector('.oe-login') !== null){
		uiApp.hide(shortInfo);
		uiApp.show(longInfo, 'block');
		document.querySelector(selector).style.display = "none";	
		return; // exit!
	}
	
	/*
	Set up interaction on the 'info' icon
	*/
	let defaultDisplay = shortInfo, 
		otherDisplay = longInfo,
		shortDesc = true;
		
	/**
	* show/hide switcher
	* @param {HTMLELement} a - show
	* @param {HTMLELement} b - hide
	*/	
	const showHide = (a,b) => {
		a.style.display = "block";
		b.style.display = "none";
	};
	
	/*
	Events
	*/
	const changeDefault = () => {
		// clicking changes the default state "view" state
		defaultDisplay 	= shortDesc ? longInfo : shortInfo;
		otherDisplay 	= shortDesc ? shortInfo : longInfo;
		shortDesc = !shortDesc;
		
		// Update View (may not change view but is now default IS updated)
		showHide(defaultDisplay,otherDisplay);
	};
	
	uiApp.userEnter(	selector,	() => showHide(otherDisplay,defaultDisplay) );
	uiApp.userLeave(	selector,	() => showHide(defaultDisplay,otherDisplay) );	
	uiApp.userDown(	selector,	changeDefault );

})(bluejay); 
(function (uiApp) {

	'use strict';
	
	uiApp.addModule('overlayPopup');
	
	/*
	Pretty simple. Click on something (by id), load in some PHP demo content, assign a selector to close
	*/
	const pops = [ 	
		{id:'#js-idg-popup-content-template',php:'_popup-content-template.php'}, // template (standardisation)
		{id:'#js-change-context-btn', php:'change-context.php' },	// change context (firm)
		{id:'#copy-edit-history-btn', php:'previous-history-elements.php' }, // duplicate history element
		{id:'#copy-edit-anterior-segment-btn', php:'previous-ed-anterior.php' }, // duplicate history element ED
		{id:'#js-virtual-clinic-btn', php:'virtual-clinic.php' }, // virtual clinic change:
		{id:'#js-delete-event-btn', php:'delete-event.php'}, // Delete Event generic example:
		{id:'#js-close-element-btn', php:'close-element.php' }, // Remove element confirmation
		{id:'#js-add-new-event', php:'add-new-event.php' }, // Add New Event in SEM view mode
		{id:'#js-idg-preview-correspondence', php:'letter-preview.php' }, // duplicate history element
		{id:'#js-idg-exam-complog', php:'exam-va-COMPlog.php' }, // Duplicate Event
		{id:'#js-duplicate-event-btn', php:'duplicate-event-warning.php' }, 
		{id:'#js-idg-worklist-ps-add', php:'worklist-PS.php' }, // Worklist PSD / PSG	
		{id:'#analytics-change-filters', php:'analytics-filters.php' }, // Analytics Custom Filters	
		{id:'#js-idg-add-new-contact-popup', php:'add-new-contact.php' }, // Add new contact
		{id:'#js-idg-admin-queset-demo',php:'admin-add-queue.php'},
		{id:'#js-idg-search-query-save',php:'query-save.php'}, // Search, manage Queries popup 
		{id:'#js-idg-search-all-searches',php:'query-all-searches.php'}, // Search, manage Queries popup 
	];

	const overlayPopup = (id,php) => {	
		const showPopup = () => {
			// xhr returns a Promise... 
			uiApp.xhr('/idg-php/v3/_load/' + php)
				.then( xreq => {
					const div = document.createElement('div');
					div.className = "oe-popup-wrap";
					div.innerHTML = xreq.html;
					div.querySelector('.close-icon-btn').addEventListener("mousedown", (ev) => {
						ev.stopPropagation();
						uiApp.remove(div);
					}, {once:true} );
					
					// reflow DOM
					document.body.appendChild( div );
				})
				.catch(e => console.log('OverlayPopup failed to load: Err msg -',e));  // maybe output this to UI at somepoint, but for now... 
		};
		
		// register Events
		uiApp.userDown(id,showPopup);
	};
	
	/*
	Init IDG popup overlay demos, if element is in the DOM
	*/
	
	for(let i=0,len=pops.length;i<len;i++){
		let p = pops[i];
		let el = document.querySelector(p.id);
		if(el !== null){
			overlayPopup(	p.id,
							p.php);
		}
	}
			
})(bluejay); 
(function (uiApp) {

	'use strict';
	
	uiApp.addModule('overlayPopupJSON');
	
	/*
	New approach to loading Popups (class based, rather than id) 
	Assumes node has a data-idgDemo={JSON}
	in JSON should be a PHP file path e.g, /file.php?name=value
	it also assumes the standard popup close btn structure (... JSON could provide)
	*/
	
	const showPopup = (ev) => {
		let php; 
		
		if(ev.target.dataset.idgDemo !== undefined){
			php = JSON.parse(ev.target.dataset.idgDemo).php;
		} else {
			throw new Error('overlayPopupJSON: No php file info? Needs data-idg-demo=json');
		}

		// xhr returns a Promise... 
		uiApp.xhr('/idg-php/v3/_load/' + php)
			.then( xreq => {
				const div = document.createElement('div');
				div.className = "oe-popup-wrap";
				div.innerHTML = xreq.html;
				// reflow DOM
				document.body.append( div );
				
				// need this in case PHP errors and doesn't build the close btn DOM
				let closeBtn = div.querySelector('.close-icon-btn');
				if(closeBtn){
					closeBtn.addEventListener("mousedown", (ev) => {
						ev.stopPropagation();
						uiApp.remove(div);
					}, {once:true} );
				}
			})
			.catch(e => console.log('overlayPopupJSON: Failed to load',e));  // maybe output this to UI at somepoint, but for now... 
	};
	
	
	uiApp.userDown('.js-idg-demo-popup-json', showPopup);
			
})(bluejay); 
(function (uiApp) {

	'use strict';	
	
	uiApp.addModule('patientPopups');	
	
	const cssActive = 'active';
	const cssOpen = 'open';
	
	/*
	Patient popup (icons at the top next to the Patient name)
	Originally, hover interaction was only on the icon but this 
	has been changed to allow 'hover' over the popup content	
	uses unique IDs for DOM elements
	*/
	const map = [
		{btn:'#js-quicklook-btn', content:'#patient-summary-quicklook' },
		{btn:'#js-demographics-btn', content:'#patient-popup-demographics'},
		{btn:'#js-management-btn', content:'#patient-popup-management'},
		{btn:'#js-allergies-risks-btn', content:'#patient-popup-allergies-risks'},
		{btn:'#js-charts-btn', content:'#patient-popup-charts'},
		{btn:'#js-patient-extra-btn', content:'#patient-popup-trials'},
	];
	
	
	/*
	Methods	
	*/
	const _over = () => ({
		/**
		* Callback for 'hover'
		*/
		over: function(){
			this.btn.classList.add( cssActive );
			this.show();
		}	
	});
	
	const _out = () => ({
		/**
		* Callback for 'exit'
		*/
		out: function(e){
			if(e.relatedTarget === this.content) return;
			this.hide();
			this.btn.classList.remove( cssActive );
			
		}	
	});
	
	const _change = () => ({
		/**
		* Callback for 'click'
		*/
		change: function(){
			if(this.open)	this.hide();
			else			this.show();
		}
	});
	
	const _show = () => ({
		/**
		* Show content
		*/
		show:function(){
			if(this.open) return;
			this.open = true;
			hideOtherPopups(this);
			this.btn.classList.add( cssOpen );
			uiApp.show(this.content, 'block');
		}	
	});
	
	const _hide = () => ({
		/**
		* Hide content
		*/
		hide:function(){
			if(this.open === false || this.isLocked ) return;
			this.open = false;
			this.btn.classList.remove( cssActive, cssOpen );
			uiApp.hide(this.content);
		}
	});
	
	const _makeLocked = () => ({
		/**
		* 'locked' open if user clicks after opening with 'hover'
		*/
		makeLocked: function(){
			this.isLocked = true; 
			this.btn.classList.add( cssOpen );
		}
	});	
	
	const _makeHidden = () => ({
		makeHidden:function(){
			if(this.open){
				this.isLocked = false;
				this.hide();
			}
		}
	});
	

	/**
	* @class
	* PatientPopups
	* @param {object} me - set up
	*/
	const PatientPopup = (me) => {
		me.open = false;
		me.isLocked = false;
		return Object.assign( 	me,
								_change(),
								_over(),
								_out(),
								_makeLocked(),
								_show(),
								_hide(),
								_makeHidden() );
	};

	
	/**
	* group control all popups
	*/
	const hideOtherPopups = (showing) => {
		map.forEach((item) => {
			if(item.popup != showing){
				item.popup.makeHidden();
			}
		});
	};
	
	/**
	* Init
	*/
	map.forEach((item) => {
		// only init if there is a btn in the DOM
		let btn = document.querySelector(item.btn);
		if(btn !== null){
			let popup = PatientPopup({	
				btn: btn,
				content: document.querySelector(item.content) 
			});					
			uiApp.userDown(item.btn, () => popup.change());
			uiApp.userEnter(item.btn, () => popup.over());
			uiApp.userLeave(item.btn, (e) => popup.out(e));
			uiApp.userLeave(item.content, (e) => popup.out(e));
			item.popup = popup; // store.
		}	
	});
	

})(bluejay); 
(function (uiApp) {

	'use strict';	
	
	uiApp.addModule('patientQuickMeta');
	
	let	open = false,
		fixed = false,
		currentIcon = null,
		div = null,
		closeBtn = null,
		winHeight = window.innerHeight; // forces reflow, only update onResize
		
	const text = {};
	
	const buildDOM = () => {
		const div = document.createElement('div');
		div.className = "oe-patient-quick-overview";
		div.style.display = "none";
		div.innerHTML = [
			'<div class="close-icon-btn"><i class="oe-i remove-circle medium"></i></div>',
			'<div class="oe-patient-meta">',
			'<div class="patient-name">',
			'<a href="/v3-SEM/patient-overview"><span class="patient-surname">SURNAME</span>, <span class="patient-firstname">First (M.)</span></a>',
			'</div><div class="patient-details">',
			'<div class="hospital-number"><span>ID</span>0000000</div>',
			'<div class="nhs-number"><span>NHS</span>111 222 3333</div>',
			'<div class="patient-gender"><em>Gen</em>Male</div>',
			'<div class="patient-age"><em>Age</em>00y</div>',
			'</div></div>',
			'<div class="quick-overview-content"></div>',].join('');
			
		document.body.appendChild( div );
		
		closeBtn = div.querySelector('.close-icon-btn');
		
		text.surname = div.querySelector('.patient-surname');
		text.first = div.querySelector('.patient-firstname');
		text.hospital = div.querySelector('.hospital-number');
		text.nhs = div.querySelector('.nhs-number');
		text.gender = div.querySelector('.patient-gender');
		text.age = div.querySelector('.patient-age');
		
		return div;
	};
	
	const hide = () => {
		div.style.display = "none";
		open = fixed = false;
		currentIcon = null;
	};

	const show = (icon, clicked) => {
		// is click to fix open?
		if(currentIcon === icon && open){
			fixed = true;
			uiApp.show(closeBtn, 'block');
			return;
		}
		
		div = div || buildDOM();
		open = true;
		fixed = clicked;
		currentIcon = icon;
		 
		
		let dataSet = icon.dataset;
		let rect = icon.getBoundingClientRect();
		let mode = dataSet.mode;
		let php = dataSet.php;
		let patient = JSON.parse( dataSet.patient );
		
		/*
		set up patient meta
		*/
		text.surname.textContent = patient.surname;
		text.first.textContent = patient.first;
		text.hospital.innerHTML = '<span>ID</span> '+ patient.id;
		text.nhs.innerHTML = '<span>NHS</span> '+ patient.nhs;
		text.gender.innerHTML = '<em>Gen</em> '+ patient.gender;
		text.age.innerHTML = '<em>Age</em> '+ patient.age;
		
		/*
		The CSS approach is different for float / sidepanel
		wipe any inline styles before setting up
		*/
		div.style.cssText = " ";
		
		/*
		CSS can handle a mode of "side"
		it will lock the panel to the RHS
		just add "side-panel" class...
		However, mode = "float" requires a 
		JS positioning relative to the icon.
		*/ 
		if( mode == "float"){
			/*
			floating fixed, calculate position
			in relation to the icon,
			*/
			div.classList.remove("side-panel");
			
			// check not too close the bottom of the screen:
			if(winHeight - rect.y > 300){
				div.style.top 	= (rect.y + rect.height + 5) + "px";
			} else {
				div.style.bottom = (winHeight - rect.top) + 10 + "px";
			}
			
			div.style.left 	= (rect.x - 250 +  rect.width/2)  + "px";

		} else {
			div.classList.add("side-panel"); 			
		}
		
		let content = div.querySelector('.quick-overview-content');
		content.innerHTML = "";
		
		// slow loading??
		let spinnerID = setTimeout( () => content.innerHTML = '<i class="spinner"></i>', 400);	
		
		if(clicked){
			uiApp.show(closeBtn, 'block');
		} else {
			uiApp.hide(closeBtn);
		}
		
		// xhr returns a Promise... 
		uiApp.xhr('/idg-php/v3/_load/' + php)
			.then( xreq => {
				clearTimeout(spinnerID);
				if(open){
					content.innerHTML = xreq.html;
					div.style.display = "block";
				}
				
			})
			.catch(e => console.log('ed3app php failed to load',e));  // maybe output this to UI at somepoint, but for now...
	};
	
	/**
	* Callback for 'Click'
	* @param {event} event
	*/
	const userClick = (ev) => {
		let icon = ev.target;
		if(open && fixed && currentIcon === icon) {
			hide(); // this is an unclick!
		} else {
			show(icon, true); // new 
		}
	};
	
	/**
	* Callback for 'Hover'
	* @param {event} event
	*/
	const userHover = (ev) => {
		if(fixed) return;
		show(ev.target, false);
	};
	
	/**
	* Callback for 'Exit'
	* @param {event} event
	*/
	const userOut = (ev) => {
		if(fixed) return;
		hide();
	};
	

	uiApp.userDown('.js-patient-quick-overview',userClick);
	uiApp.userEnter('.js-patient-quick-overview',userHover);
	uiApp.userLeave('.js-patient-quick-overview',userOut);
	uiApp.userDown('.oe-patient-quick-overview .close-icon-btn .oe-i',hide);
	
	// innerWidth forces a reflow, only update when necessary
	uiApp.listenForResize(() => winHeight = window.inneHeight );
	
})(bluejay); 
(function (uiApp) {

	'use strict';	
	
	uiApp.addModule('proView');	
	
	/**
	Generally Pro view has 2 states: Collapsed (pro) list and Exapanded (normal) of the SAME data
	However, there are situations where the Pro view remains open and more data is shown by expanding 
	AND the View change is controlled BILATERALY! ... e.g. PCR Risks 
	*/

	const states = []; // store UI states
	
	/*
	Methods	
	*/
	const _hideShow = () => ({
		/**
		* hide/show content areas
		* @param {HTMLElement} to hide 
		* @param {HTMLElement} to show
		*/
		hideShow: function(hide,show){
			if(hide) hide.style.display = "none";
			if(show) show.style.display = "block";
		}	
	});
	
	const _icon = () => ({
		/**
		* Update icon state
		* @param {string}  
		* @param {string} 
		*/
		icon: function(find,replace){
			this.oei.classList.replace(find,replace);
		}	
	});
	
	const _change = () => ({
		/**
		* Change state 
		*/
		change: function(){
			if(this.inPro){
				this.hideShow(this.pro,this.standard);
				this.icon('expand','collapse');
			} else {
				this.hideShow(this.standard,this.pro);
				this.icon('collapse','expand');
			}
			
			if(this.linked){
				this.linkedProView.change();
			}
			
			this.inPro = !this.inPro;
		}	
	});
	
	const _changeContent = () => ({
		/**
		* Basic state change, 
		* only changes content and only used by LinkedProView
		*/
		change: function(){
			if(this.inPro){
				this.hideShow(this.pro,this.standard);
			} else {
				this.hideShow(this.standard,this.pro);
			}
			this.inPro = !this.inPro;
		}	
	});
	
	const _options = (json) => ({
		/**
		* Customise based on JSON settings in the DOM
		* @param {Obj} json
		*/
		options: function(json){
			/*
			Lock Pro view open?
			i.e. Standard data expands data shown (PCR Risk)
			*/
			if(json.lock) this.pro = null;	// hide/show will ignore it
			 
			/*
			DOM will provide ID for linked ProView 
			then this ProView will control 2 ProViews (Bilateral)
			*/
			if(json.linkID != false){
				this.linked = true; 
				this.linkedProView = LinkedProView( document.querySelector('#' + json.linkID));
				if(json.lock) this.linkedProView.pro = null; // set up to behave the same
			}
		}
	});
	
	/**
	* @Class 
	* @param {Node} .pro-data-view
	* @returns new Object
	*/
	const ProView = (parentNode) => {
		
		let btn = parentNode.querySelector('.pro-view-btn');
		let pro = parentNode.querySelector('.data-pro-view');
		let standard = parentNode.querySelector('.data-standard-view');
		
		let me = {	btn: btn,
					oei: btn.querySelector('.oe-i'),
					pro: pro,
					standard: standard,		
					inPro: true,
					linked: false };
		
		return Object.assign(	me,
								_change(),
								_hideShow(),
								_icon(),
								_options() );
	};
	
	/**
	* @Class
	* Provide a basic version of ProView for when they are 'linked'
	* This will be controlled through the ProView instance
	* @param {Node} .pro-data-view
	* @returns new Objec
	*/
	const LinkedProView = (parentNode) => {
		let me = {	pro: parentNode.querySelector('.data-pro-view'),
					standard: parentNode.querySelector('.data-standard-view'),		
					inPro: true };
					
		return Object.assign(	me,
								_changeContent(),
								_hideShow() 
							);
	};
	
	

	/**
	* Callback for Event (header btn)
	* @param {event} event
	*/
	const userClick = (ev) => {
		const btn = ev.target;
		let dataAttr = uiApp.getDataAttr(btn);
		if(dataAttr){
			// DOM already setup, change it's current state
			states[parseFloat(dataAttr)].change();
		} else {
			// ...not setup yet, record state ref in DOM
			uiApp.setDataAttr(btn, states.length);
			
			let pro = ProView(uiApp.getParent(btn, '.pro-data-view'));
			pro.options(JSON.parse(btn.dataset.proview));
			pro.change();		// update UI (because this a click)
			states.push(pro);	// store 
		}
	};

	// Regsiter for Events
	uiApp.userDown('.pro-view-btn', userClick);


})(bluejay); 
(function( bj ) {

	'use strict';	
	
	bj.addModule('syncData');	
	
	if( document.getElementById('js-sync-data') == null ) return;
	
	/**
	Sync widget for use on screens that needs auto-refreshing
	e.g. Worklists and Clinic Manager
	For Opening it using the general-ui pattern
	*/
	
	const syncBtn = document.querySelector('.sync-data .sync-btn');
	const syncTime = document.querySelector('.sync-data .last-sync');
	const syncInterval = document.querySelector('.sync-data .sync-interval');
	let timerID = null;
	
	const setSyncTime = () => syncTime.textContent = bj.clock24( new Date( Date.now()));

	const setSyncInterval = ( mins ) => {
		clearInterval( timerID );
		if( mins ){
			const suffix = mins > 1 ? 'mins' : 'min';
			syncInterval.textContent = `${mins} ${suffix}`;
			timerID = setInterval(() => setSyncTime(), mins * 60000 );
			setSyncTime();
			syncBtn.classList.add('on');
		} else {
			syncInterval.textContent = 'Sync OFF';
			syncBtn.classList.remove('on');
		}	
	};
	
	// default is always 1 minute
	setSyncInterval( 1 );
		
	bj.userClick('.sync-options button', ( ev ) => {
		setSyncInterval( parseInt( ev.target.dataset.sync, 10));
	});


})( bluejay ); 
(function (uiApp) {

	'use strict';	
	
	uiApp.addModule('textAreaResize');	
	
	/**
	* Resize textarea 
	* @param {HTMLElement} <textarea>
	*/ 
	const resize = ( textArea ) => {
		let h = textArea.scrollHeight;
		// check for line jumps
		if( (h - textArea.clientHeight) > 15 ){
			textArea.style.height = 'auto';
			textArea.style.height = h + 5 + 'px';
		}		
	};
	
	/**
	Make resize available for comments that reveal a textarea
	*/
	uiApp.extend('resizeTextArea',resize);	
	

	/**
	* Resize textarea on 'input'
	*/
	document.addEventListener('input', ( ev ) => {
		if(ev.target.tagName == "TEXTAREA"){
			resize( ev.target );
		}
	}, false );
	
	/**
	* Expand textareas that are overflowing onLoad
	*/
	document.addEventListener('DOMContentLoaded', () => {
		let all = uiApp.nodeArray( document.querySelectorAll('textarea') );
		all.forEach((t)=>{
			resize(t);
		});
	});
	
	
	
})(bluejay); 
(function( bj ){
	
	'use strict';
	
	bj.addModule('tooltip'); 
	
	/** 
	* Model
	* extended with views
	*/
	const model = Object.assign({
		selector: ".js-has-tooltip",
		showing:false,
		target:null,
		type: null, // or, bilateral
		clickThrough: false, // does tooltip click through to a popup showing full details? Note: important for touch!
		tip: null, // tooltip content
		eyeIcons: null, // only applies to bilateral popups
		
		/**
		* Reset the Model
		*/
		reset(){
			this.showing = false;
			this.type = null;
			this.target = null;
			this.views.notify();
		},
		
		/**
		* Update the Model
		* @param {EventTarget} target
		*/
		update( target ){
			this.showing = true;
			this.target = target;
			

			if( target.hasAttribute('data-tooltip-content')){
				/*
				Support the old data attribute for basic tooltips
				*/
				this.type = "basic";
				this.tip = target.dataset.tooltipContent;
				
			} else {
				/*
				New JSON approach for more advanced tooltips
				*/
				const json = JSON.parse( target.dataset.tt );
				this.type = json.type;
				this.clickThrough = json.clickPopup; // click through to a popup?
				
				if( this.type == 'bilateral' ){
					this.tip = {
						r: json.tipR,
						l: json.tipL
					};
					this.eyeIcons = json.eyeIcons;
				} else {
					// basic
					this.tip = json.tip;
				}	
			}
			
			this.views.notify();
		}
		
	}, bj.ModelViews());
	
	
	/**
	* Views 
	*
	* Only one tooltip DIV: Basic and Bilateral both use it
	* @returns API
	*/
	const tooltip = (() => {
		const div = document.createElement('div');
		
		// innerWidth forces a reflow, only update when necessary
		let winWidth = window.innerWidth;
		bj.listenForResize( () => winWidth = window.innerWidth );
	
		/**
		* Reset the tooltip DOM
		*/
		const reset = () => {
			div.innerHTML = "";
			div.className = "oe-tooltip"; // clear all CSS classes
			div.style.cssText = "display:none"; // clear ALL styles & hide
		};
		
		/**
		* Show the tip and position
		*/
		const show = ( display, width ) => {
			/*
			Check the tooltip height to see if content fits default positioning	
			*/
			let offsetW = width/2; 
			let offsetH = 8; // visual offset, which allows for the arrow
			
			// can't get the DOM height without some trickery...
			let h = bj.getHiddenElemSize(div).h;
							
			/*
			work out positioning based on icon
			this is a little more complex due to the hotlist being
			fixed open by CSS above a certain browser size, the
			tooltip could be cropped on the right side if it is.
			*/
			let domRect = model.target.getBoundingClientRect();
			let center = domRect.right - ( domRect.width/2 );
			let top = domRect.top - h - offsetH;
		
			// watch out for the hotlist, which may overlay the tooltip content
			let maxRightPos = winWidth > bj.settings("cssHotlistFixed") ? bj.settings("cssExtended") : winWidth;
			
			/*
			setup CSS classes to visually position the 
			arrow correctly based on tooltip positoning
			*/
			
			// too close to the left?
			if( center <= offsetW ){
				offsetW = 20; 			// position to the right of icon, needs to match CSS arrow position
				div.classList.add("offset-right");
			}
			
			// too close to the right?
			if ( center > ( maxRightPos - offsetW )){
				offsetW = ( width - 20 ); 			// position to the left of icon, needs to match CSS arrow position
				div.classList.add("offset-left");
			}
			
			// is there enough space above icon for standard posiitoning?
			if( domRect.top < h ){
				top = domRect.bottom + offsetH; // nope, invert and position below
				div.classList.add("inverted");
			} 
			
			/*
			update DOM and show the tooltip
			*/
			div.style.top = top + 'px';
			div.style.left = (center - offsetW) + 'px';
			div.style.display = display;
		};
		
		/**
		* Reset tooltip if model resets
		*/
		model.views.add(() => {
			if( !model.showing ) reset();
		});
		
		/**
		* intialise and append to DOM
		*/
		reset();
		document.body.appendChild( div );
		
		// public	
		return { div, reset, show };
	})();
	
	
	/**
	* Basic tooltip
	*/
	const basic = () => {
		if( model.type === 'basic' ){
			/*
			* basic: HTML 'tip' may contain HTML tags
			*/
			tooltip.reset();
			tooltip.div.innerHTML = model.tip;
			tooltip.show( "block", 200 ); // CSS width: must match 'newblue'
		}
	};
	
	// observe model
	model.views.add( basic );
	
	/**
	* Bilateral tooltip
	* Use Mustache template
	*/
	const bilateral = (() => {
		const template ='<div class="right">{{&r}}</div><div class="left">{{&l}}</div>';
		
		const update = () => {
			if( model.type === 'bilateral'){
				/** 
				* Bilateral enhances the basic tooltip
				* with 2 content areas for Right and Left 	
				*/
				tooltip.reset();
				tooltip.div.classList.add('bilateral');
				tooltip.div.innerHTML = Mustache.render( template, model.tip );
				
				// hide R / L icons?
				if( !model.eyeIcons ) tooltip.div.classList.add('no-icons');
				
				tooltip.show( "flex", 400 ); // CSS width: must match 'newblue'
			}
		};
		
		// observe model
		model.views.add( update );
	
	})();
	
	/**
	* Out (or click toggle tip)
	* @param {Event} ev
	*/
	const userOut = (ev) => {
		if( model.showing === false ) return; 
		model.reset();  // reset the Tooltip
		window.removeEventListener('scroll', userOut, { capture:true, once:true });
	};
	
	/**
	* Over (or click toggle tip)
	* if the user scrolls, remove the tooltip (as it will be out of position)
	* @param {Event} ev
	*/
	const userOver = ( ev ) => {
		model.update( ev.target ); 
		window.addEventListener('scroll', userOut, { capture:true, once:true });
	};
	
	/**
	* Covers touch behaviour
	* @param {Event} ev
	*/
	const userClick = ( ev ) => {
		if( ev.target.isSameNode( model.target ) && model.showing ){
			// this will need updating to support clickThrough on touch.
			// tooltip should not get shown.
			userOut();
		} else {
			userOver( ev );
		}
	};
		
	/**
	Events
	*/
	bj.userDown( model.selector, userClick );
	bj.userEnter( model.selector, userOver );
	bj.userLeave( model.selector, userOut );
	
	
})( bluejay ); 
(function (uiApp) {

	'use strict';
	
	uiApp.addModule('whiteboard');
	
	if(document.querySelector('main.oe-whiteboard') === null) return;
	
	/*
	In Whiteboard mode hide these DOM Elements
	*/
	uiApp.hide(document.querySelector('#oe-admin-notifcation'));
	
	/*
	Set up Whiteboard 
	2 states: Standard & Biometry report
	Handling both... 
	*/
	
	// Actions panel (bottom) is standard for both:
	const actionsPanel = document.querySelector('.wb3-actions');
	const actionsBtn = document.querySelector('#js-wb3-openclose-actions');
	
	const openClosePanel = (ev) => {
		if(actionsBtn.classList.contains('up')){
			actionsBtn.classList.replace('up','close');
			actionsPanel.classList.replace('down','up'); // CSS animation
		} else {
			actionsBtn.classList.replace('close','up');
			actionsPanel.classList.replace('up','down'); // CSS animation
		}
	};
	
	uiApp.userDown('#js-wb3-openclose-actions', openClosePanel);
	
	// provide a way to click around the whiteboard demos:		
	uiApp.userDown('.wb-idg-demo-btn',(ev) => {
		window.location = '/v3-whiteboard/' + ev.target.dataset.url;
	});
	
	/*
	Standard
	Demo the editible text concept
	*/
	uiApp.userDown('.edit-widget-btn .oe-i', (ev) => {
		// check the state.
		let oei = ev.target;
		let widget = uiApp.getParent(oei, '.oe-wb-widget');
		let view = widget.querySelector('.wb-data ul');
		let edit = widget.querySelector('.wb-data .edit-widget');
		
		if(oei.classList.contains('pencil')){
			oei.classList.replace('pencil','tick');
			uiApp.hide(view);
			uiApp.show(edit, 'block');
		} else {
			oei.classList.replace('tick','pencil');
			uiApp.hide(edit);
			uiApp.show(view, 'block');
		}
	});

	/*
	Overflow popup?
	--- MOVED, into a seperate script in newblue! 
	*/
/*
	const overflowPopup = ( ev ) => {
		const json = JSON.parse( ev.target.dataset.overflow );
		let div = document.createElement('div');
		div.className = "oe-popup-wrap clear";
		div.innerHTML = `<div class="wb-data-overflow-popup">${json.data}</div>`;
		document.body.appendChild( div );	
	};
	
	uiApp.userDown('.overflow-icon-btn', overflowPopup );
	uiApp.userDown('.wb-data-overflow-popup', ( ev ) => {
		let wrap = uiApp.getParent( ev.target, '.oe-popup-wrap' );
		uiApp.remove( wrap );
	});
*/

	/*
	Biometry Report?
	*/
	if(document.querySelector('.multipage-nav') === null) return;
	
	let stack = document.querySelector('.multipage-stack');
	let pages = uiApp.nodeArray(stack.querySelectorAll('img'));
	
	/*
	Get first IMG height Attribute to work out page scrolling.
	note: CSS adds 20px padding to the (bottom) of all images
	*/
	let pageH = pages[0].height + 20;
	uiApp.listenForResize(() => pageH = pages[0].height + 20 );

	// scrollJump 
	let scrollPos = 0;
	const scrollJump = (px) => {
		scrollPos = scrollPos + px;
		if(scrollPos < 0) scrollPos = 0;
		if(scrollPos > (pages.length * pageH)) scrollPos = pages.length * pageH;
		stack.scrollTop = scrollPos; // uses CSS scroll behaviour
	};

	uiApp.userDown('#js-scroll-btn-down', () => scrollJump(200) );
	uiApp.userDown('#js-scroll-btn-up', () => scrollJump(-200) );
	
	let pageJump = document.querySelector('.page-jump');
	
	pages.forEach((page, i) => {
		let div = document.createElement('div');
		div.className = "page-num-btn";
		div.setAttribute('data-page', i);
		div.textContent = i + 1;
		pageJump.appendChild(div);
	});
	
	uiApp.userDown('.page-num-btn', (e) => {
		scrollPos = 0;
		let pageScroll = parseInt(e.target.dataset.page * pageH);
		scrollJump(pageScroll);
	});
	
	
	
	
	
		
})(bluejay); 



(function( bj ){

	'use strict';	
	
	bj.addModule('GUI-btnShowContent');
	
	const cssActive = 'active';
	
	/**
	Common interaction pattern for all these Elements
	*/
	const mapElems = [
		{ // Nav, shortcuts
			btn: 'js-nav-shortcuts-btn',
			wrapper: 'js-nav-shortcuts',
			contentID: 'js-nav-shortcuts-subnav',
		}, 
		{ // Nav, (was worklist button)
			btn: 'js-nav-patientgroups-btn',
			wrapper: 'js-patientgroups-panel-wrapper',
			contentID: 'js-patientgroups-panel',
		},
		{ // Print Event options
			btn: 'js-header-print-dropdown-btn',
			wrapper: 'js-header-print-dropdown',
			contentID: 'js-header-print-subnav',
		},
		{ // Fancy new Event sidebar filter (IDG)
			btn: 'js-sidebar-filter-btn',
			wrapper: 'js-sidebar-filter',
			contentID: 'js-sidebar-filter-options',
		},
		// Sync, in header (Worklist)
		{
			btn: 'js-sync-btn',
			wrapper: 'js-sync-data',
			contentID: 'js-sync-options',
		}
	];

	
	/**
	Methods	
	*/
	const _change = () => ({
		/**
		* Callback for mousedown
		*/
		change: function(){
			if(this.open) this.hide();
			else this.show();
		}
	});
	
	const _show = () => ({
		/**
		* Show content
		* Callback for Mouseenter
		*/
		show:function(){
			if( this.open ) return;
			this.open = true;
			this.btn.classList.add( cssActive );
			bj.show( this.content, 'block');
		}	
	});
	
	const _hide = () => ({
		/**
		* Hide content
		* Callback for Mouseleave
		*/
		hide:function(){
			if( !this.open ) return;
			this.open = false;
			this.btn.classList.remove( cssActive );
			bj.hide( this.content );
		}
	});

	/**
	* @Class
	* builds generic pattern for these elements
	* @returns {Object} 
	*/
	const btnShowContent = ( me ) => Object.assign( me, _change(), _show(), _hide());
	
	/**
	* Init common elems
	* but only if there is a btn in the DOM
	*/
	mapElems.forEach(( item ) => {
		
		const btn = document.getElementById( item.btn );
		
		if( btn !== null ){

			const obj = btnShowContent({	
				btn: btn,
				content: document.getElementById( item.contentID ),
				open: false, 
			});
		
			bj.userDown(`#${item.btn}`, () => obj.change());			
			bj.userEnter(`#${item.btn}`, () => obj.show());
			bj.userLeave(`#${item.wrapper}`, () => obj.hide());
		}	
	});
		

})( bluejay ); 
(function( bj ) {

	'use strict';	
	
	if( document.querySelector('.openers-menu') === null ) return;

	
	/**
	Behaviour for the Logo Panel and the Menu Panel
	is identical, however the Menu isn't included on 
	the Login page
	*/

	const css = {
		btnActive: 'active',
		panelShow: 'show'
	};

	/*
	Methods	
	*/
	const _change = () => ({
		/**
		* Callback for 'down'
		*/
		change: function(){
			if(this.open)	this.hide();
			else			this.show();
		}
	});
	
	const _show = () => ({
		/**
		* Callback for 'enter'
		*/
		show:function(){
			if(this.open) return;
			this.open = true;
			this.btn.classList.add( css.btnActive );
			
			// panel needs a bit of work
			//clearTimeout( this.hideTimerID ); 
			this.panel.classList.add( css.panelShow );
			this.panel.style.pointerEvents = "auto";
		}	
	});
	
	const _hide = () => ({
		/**
		* Callback for 'leave'
		*/
		hide:function(){
			if(this.open === false) return;
			this.open = false;
			this.btn.classList.remove( css.btnActive );
			this.panel.classList.remove( css.panelShow );
			this.panel.style.pointerEvents = "none";
			
		}
	});
	
	/**
	* navSlidePanel.
	* Pattern is the same for Logo and Menu
	* @param {Object} me - setup object
	* @returns navSlidePanel instance
	*/
	const navSlidePanel = ( me ) => {
		return Object.assign( me, _change(), _show(), _hide() );
	};
	
	
	/**
	Init - Menu
	*/
	const menuBtn = '#js-openers-menu-btn';
	
	if( document.querySelector( menuBtn ) === null ) return; // login page
	
	const menu = navSlidePanel({
		btn: document.querySelector( menuBtn ),
		panel: document.querySelector('.menu-info'),
		open: false,
	});
	
	// Events
	bj.userDown( menuBtn, () => menu.change());			
	bj.userEnter( menuBtn, () => menu.show());
	bj.userLeave('.openers-menu', () => menu.hide());
	

})( bluejay ); 
(function (uiApp) {

	'use strict';
	
	uiApp.addModule('attachmentThumbnail');
	
	/*
	Attachments Thumbnails
	Open up a fullscreen popup up of PNG or PDF
	*/
	
	const css = {
		thumb: "oe-attachment-thumbnail",
	};
	
	let div,open = false;
	const btn = {};
		
	/*
	Pretty sure, these won't be dynamically loaded later...
	*/
	let thumbs = uiApp.nodeArray(document.querySelectorAll('.'+css.thumb));
	if(thumbs.length < 1) return; // no elements, bail.
	
	/**
	* Show file attachment
	* @param {JSON object} 
	*/
	const showAttachment = (json) => {
		open = true;
		// create DOM (keep out of reflow)
		div = document.createElement('div');
		div.className = "oe-popup-wrap";
		
		/*
		The popup attachment in it's basic form shows the file attachment (PNG or PDF)
		If PDF then the browser will handle it, if PNG provide re-scale options.
		"Annotation" mode (edit) adds Element inputs and adjust the layout to fit everything in
		*/
	
		// DOM template
		let html = '<div class="oe-popup-attachment">';
		html += '<div class="title">'+json.title+'</div>';
		html += '<div class="close-icon-btn"><i class="oe-i remove-circle pro-theme"></i></div>';
		html += '<div class="file-attachment-content"></div>';
		html += '<div class="file-size-controls"></div>';
		html += '</div>';	
		
		div.innerHTML = html;
	
		const attachment = div.querySelector('.file-attachment-content');
		const controls =  div.querySelector('.file-size-controls');
		
		// build btns
		const btnFragment = new DocumentFragment();
		const addBtn = (text,css,id=false) => {
			let myBtn = document.createElement('button');
			myBtn.className = css;
			if(id) myBtn.id = id;
			myBtn.textContent = text;
			btnFragment.appendChild(myBtn);
			return myBtn;
		};	
		
		/*
		Load in PNG or PDF
		PNG needs the resize options
		*/
		if(json.type !== "pdf"){
			/*
			Load PNG as a background AND as an IMG
			*/
			let bgImgUrl = "url('"+json.file+"')";
			attachment.style.backgroundImage = bgImgUrl;
			attachment.innerHTML = '<img src="'+json.file+'" style="display:none"/>';
			const img = div.querySelector('img');
			
			// set up resize functionality 
			const fitToScreen = addBtn("Fit to screen","pro-theme selected","oe-att-fit");
			const actualSize = addBtn("Actual size","pro-theme","oe-att-actual");
			
			const changeImgState = (bg,display,selectedBtn,resetBtn) => {
				attachment.style.backgroundImage = bg;
				img.style.display = display;
				selectedBtn.classList.add('selected');
				resetBtn.classList.remove('selected');
			};
			
			// change image size buttons
			actualSize.addEventListener("mousedown",(e) => {
				e.stopPropagation();
				changeImgState("none","block",actualSize,fitToScreen);
			});
			
			fitToScreen.addEventListener("mousedown",(e) => {
				e.stopPropagation();
				changeImgState(bgImgUrl,"none",fitToScreen,actualSize);
			});
			
		} else {
			// PDF, easy, let Browser handle it
			attachment.innerHTML = '<embed src="'+json.file+'" width="100%" height="100%"></embed>';
			addBtn("PDF","pro-theme selected");
		}
		
		/*
		Annotate mode (edit)
		*/
		if(json.annotate){
			attachment.classList.add('annotation');
			
			let notes = document.createElement('div');
			notes.className = "attachment-annotation";
			let base = uiApp.find('.oe-popup-attachment', div);
			base.appendChild( notes );
		
			// load in PHP using XHR (returns a Promise)	
			uiApp.xhr(json.idgPHP)
				.then( xreq => {	notes.innerHTML = xreq.html;
									// IDG demo eyelat inputs...
									if(json.eyelat == "L")	notes.querySelector('#annotation-right').style.visibility = "hidden"; // maintain layout?
									if(json.eyelat == "R")	notes.querySelector('#annotation-left').style.visibility = "hidden";
								})
				.catch( e => console.log("XHR failed: ",e) );
			
			// add annotation btns
			btn.save = addBtn("Save annotations","green hint");
			btn.cancel = addBtn("Cancel","red hint");
			btn.save.addEventListener("mousedown",removeAttachment, {once:true});
			btn.cancel.addEventListener("mousedown",removeAttachment, {once:true});	
		}
		
		/*
		Is there an image stack?
		Demo how to Choose Report dropdown
		*/
		if(json.stack){
			// for demo, use the title to create fake report linksv
			let title = json.title.split(' - ');
			
			// build fake report options for <select>
			let options = '<option>'+json.title+'</option>';
			for(let i=json.stack;i;i--){
				options += '<option>' + title[0] + ' - (' + i +' Jan 1975 09:30)</option>';
			}
			
			// create a image "date" stack demo
			let stack = document.createElement('div');
			stack.className = "attachment-stack";
			stack.innerHTML = 'Choose report: <select class="pro-theme">' + options + '</select>';
			
			let base = uiApp.find('.oe-popup-attachment', div );
			base.appendChild( stack );
		}
	
		// setup close icon btn
		btn.close = div.querySelector('.close-icon-btn');
		btn.close.addEventListener("mousedown",removeAttachment, {once:true});
		
		// Add all required buttons
		controls.appendChild(btnFragment);
		
		// reflow DOM
		document.body.appendChild( div );
	}; 
	
	/**
	* Remmove popup DOM and reset
	*/
	const removeAttachment = () => {
		// clean up Eventlisteners
		btn.close.removeEventListener("mousedown",removeAttachment);
		if(btn.save){
			btn.save.removeEventListener("mousedown",removeAttachment);
			btn.cancel.removeEventListener("mousedown",removeAttachment);
		}
		// clear DOM
		uiApp.remove(div);
		open = false;
	};
	
	
	/**
	* Callback for Event
	* @param {event} event
	*/
	const userClick = (event) => {
		if(open) return;
		showAttachment(	JSON.parse(event.target.dataset.attachment ));
	};	
	
	// register for Event delegation
	uiApp.userDown('.' + css.thumb, userClick);
	
	/*
	If there is an "Annotate" button under the thumbail
	*/
	if(document.querySelectorAll('.js-annotate-attachment')){
		uiApp.userDown('.js-annotate-attachment',userClick); 
	}
	
		
})(bluejay); 
(function (uiApp) {

	'use strict';	
	
	uiApp.addModule('ed3');	
	
	/*
	Side Nav Select List filtering
	Used in Worklist, Messages, Trials, etc
	Anywhere you have a bunch of "lists" that need filtering. 
	*/
	
	let ed3app = false;
	
	const buildDOM = () => {
		let div = document.createElement('div');
		div.className = "oe-eyedraw-app spinner-loader";
		document.body.appendChild( div );
		return div;
	};
	
	const userClick = (ev) => {
		let btn = ev.target;
		ed3app = ed3app || buildDOM();
		/*
		CSS handles the x (left) positioning but we to position the 
		popup near the button, rather than centered.	
		*/
		let btnY = btn.getBoundingClientRect().bottom;
		/*
		ed3 app height fixed at 532px;
		it can not go above 60px (OE Header)
		*/
		let top = btnY - 532;
		ed3app.style.top = top < 60 ? '60px' : top + "px";
		uiApp.show(ed3app, 'block');
		
		// get demo JSON data
		let json = JSON.parse(btn.dataset.idgDemo);
		// then pass it back into PHP...
		var queryString = Object.keys(json).map(key => key + '=' + json[key]).join('&');
		
		// xhr returns a Promise... 
		uiApp.xhr('/idg-php/v3/_load/ed3/ed3-app.php?' + queryString)
			.then( xreq => {
				ed3app.innerHTML = xreq.html;
				ed3app.querySelector('.close-icon-btn').addEventListener('mousedown', () => {
					ed3app.style.display = "none";
				},{once:true});
			})
			.catch(e => console.log('ed3app php failed to load', e));  // maybe output this to UI at somepoint, but for now...			
	};

	uiApp.userDown('.js-idg-ed3-app-btn', userClick);

})(bluejay); 
(function (uiApp) {

	'use strict';
	
	uiApp.addModule('elementSelector');
	
	/*
	Element Selector 2.0
	Manager & Sidebar Nav
	*/

	const _loadPHP = () => ({
		/**
		* Loads in PHP file into DOM wrapper
		*/
		loadPHP:function(demo){
			// xhr returns a Promise... 
			uiApp.xhr(demo)
				.then( xreq => {
					// in the meantime has the user clicked to close?
					if(this.open === false) return; 
					
					this.nav = document.createElement('nav');
					this.nav.className = this.wrapClass;
					this.nav.innerHTML = xreq.html;
					// reflow DOM
					this.btn.classList.add('selected');	
					
					document.body.appendChild( this.nav );
							
				})
				.catch(e => console.log('PHP failed to load', e));  // maybe output this to UI at somepoint, but for now...
		}
	});
	
	const _close = () => ({
		/**
		* Close overlay
		* @param {Object} Event
		*/
		close:function(){
			this.open = false;
			this.btn.classList.remove('selected');
			uiApp.remove(this.nav);	
		}
	});
	
	const _change = () => ({
		/**
		* Change state
		* @param {Object} Event
		*/
		change:function(ev){
			if(this.btn === null)	
				this.btn = ev.target;

			if(this.open){
				this.close();
			} else {
				this.open = true;
				let demoPHP = JSON.parse(this.btn.dataset.demophp);
				if(demoPHP !== false){
					this.loadPHP(demoPHP);
				} else {
					this.elementSideNav();
				}
				
			}
		}
	});
	
	const _elementSideNav = () => ({
		elementSideNav:function(){
			this.nav = document.createElement('nav');
			this.nav.className = this.wrapClass;
			
			const elementTitles = uiApp.nodeArray(document.querySelectorAll('.element .element-title'));
			const listItems = elementTitles.map((title) => {
				return '<li class="element" id="side-element-contacts"><a href="#" class="selected">' + title.textContent + '</a></li>';
			});
		
			this.nav.innerHTML = [
				'<div class="element-structure">',
				'<ul class="oe-element-list">',
				listItems.join(''),
				'</ul>',
				'</div>'].join('');	
				
			document.body.appendChild( this.nav );
		}
	});
	
	/**
	* @Class 
	* @param {Object} set up
	* @returns new Object
	*/	
	const ElementOverlay = (wrap) => {
		return Object.assign({
			btn: null, 
			open: false,
			wrapClass: wrap
		}, 
		_change(),
		_loadPHP(), 
		_elementSideNav(),
		_close());			
	};

	/*
	Element manager is only required (currently) in Examination
	Only set up if DOM is available
	*/
	if(document.querySelector('#js-manage-elements-btn') !== null){
		const manager = ElementOverlay('oe-element-selector');
		// register Events
		uiApp.userDown('#js-manage-elements-btn', (ev) => manager.change(ev) );
		uiApp.userDown('.oe-element-selector .close-icon-btn button', () => manager.close() );
	}
		
	/*
	Sidebar Element view should be available in all Events
	Only set up if DOM is available
	*/
	if(document.querySelector('#js-element-structure-btn') !== null){
		const sidebar = ElementOverlay('sidebar element-overlay');
		// register Events
		uiApp.userDown('#js-element-structure-btn', (ev) => sidebar.change(ev) );
	}
	

})(bluejay); 
(function (uiApp) {

	'use strict';	
	
	uiApp.addModule('eventAuditTrial');	
	
	/*
	Only 1 of these per Event page
	*/
	const selector = '#js-event-audit-trail-btn';
	const icon = document.querySelector(selector);
	if(icon === null) return; 
	
	/*
	'popup' content should be pre-loaded in the DOM
	*/
	const popup = document.querySelector('#js-event-audit-trail');
	if(popup === null) uiApp.log('Audit Trail content not available in DOM?');
	
	let showing = false;
	
	/**
	* Callback for 'click'
	* @param {Event} ev
	*/
	const userClick = (ev) => showing ? hide(ev) : show(ev);

	/**
	* Callback for 'hover'
	* @param {Event} ev
	*/
	const show = (ev) => {
		uiApp.show(popup, 'block');
		icon.classList.add('active');
		showing = true;
	};
	
	/**
	* Callback for 'ext'
	* @param {Event} ev
	*/
	const hide = (ev) => {
		uiApp.hide(popup);
		icon.classList.remove('active');
		showing = false;
	};
	
	/*
	Events	
	*/
	uiApp.userDown(selector,userClick);
	uiApp.userEnter(selector,show);
	uiApp.userLeave(selector,hide);


})(bluejay); 
(function (uiApp) {

	'use strict';	
	
	uiApp.addModule('eventsUserTrail');	
	
	/*
	Provide a popup for a USER event activity in VIEW	
	*/
	const iconBtn = document.querySelector('#js-events-user-trail');
	if(iconBtn === null) return;
	
	let div = null;	

	const toggleEventDetails = (ev) => {
		let icon = ev.target;
		let trail = div.querySelector('#' + icon.dataset.auditid);
		
		// Did try mouseenter but it was causing a layout flicker!	
		if(trail.style.display === "block"){
			trail.style.display = "none";
		} else {
			trail.style.display = "block";
		}
	};
	
	const show = () => {
		// Build DOM
		div = document.createElement('div');
		div.className = "oe-popup-wrap";
		
		let content = document.createElement('div');
		content.className = "oe-popup oe-events-user-trail";
		
		div.appendChild(content);
		document.body.appendChild( div );
			
		// slow loading??
		let spinnerID = setTimeout( () => content.innerHTML = '<i class="spinner"></i>', 400);
		
		// xhr returns a Promise... 	
		uiApp.xhr('/idg-php/v3/_load/sidebar/events-user-trail-v2.php')
			.then( xreq => {
				clearTimeout(spinnerID);
				content.innerHTML = xreq.html;
			})
			.catch(e => console.log('ed3app php failed to load',e));  // maybe output this to UI at somepoint, but for now...	
	};
	
	const hide = () => {
		uiApp.remove(div);
	};
	

	uiApp.userDown('#js-events-user-trail', show);
	uiApp.userDown('.js-idg-toggle-event-audit-trail',toggleEventDetails);
	uiApp.userDown('.oe-events-user-trail .close-icon-btn .oe-i', hide);
		

})(bluejay); 
(function (uiApp) {

	'use strict';	
	
	uiApp.addModule('examElementSearch');	
	
	/*
	Exam Element Search (pre OE 3.0
	IDG basic demo. DOM is pre-loaded
	*/
	
	if(document.querySelector('#js-search-in-event-popup') === null) return;

	const userClick = (ev) => {
		const	hdBtn = ev.target,
				popup = document.querySelector('#js-search-in-event-popup'),
				mainEvent = document.querySelector('.main-event'),
				closeBtn = popup.querySelector('.close-icon-btn');
		
		hdBtn.classList.add('selected');
		uiApp.show(popup, 'block');
		// the pop will overlay the Event.. add this class to push the Exam content down
		mainEvent.classList.add('examination-search-active');
		
		closeBtn.addEventListener('mousedown',(ev) => {
			ev.stopPropagation();
			mainEvent.classList.remove('examination-search-active');
			uiApp.hide(popup);
			hdBtn.classList.remove('selected');
			
		},{once:true});		
	};
	
	/*
	Events
	*/
	uiApp.userDown(	'#js-search-in-event',	userClick );

})(bluejay); 
(function (uiApp) {

	'use strict';	
	
	uiApp.addModule('filterOptions');
	
	/*
	Filter options is kinda like the Adder 
	but it's a filter icon and it postions smarter 
	it can anchor to any of the four corners and the content
	updates appropriately	
	*/
	
	const states = [];
	const cssActive = 'active';
	
	/*
	Methods	
	*/
	
	const _change = () => ({
		/**
		* Callback for 'click'
		*/
		change: function(){
			if(this.open)	this.hide();
			else			this.show();
		}
	});
	
	const _show = () => ({
		/**
		* Callback for 'hover'
		* Enhanced behaviour for mouse/trackpad
		*/
		show:function(){
			if(this.open) return;
			this.open = true;
			this.btn.classList.add( cssActive );
			this.positionContent();
			uiApp.show(this.content, 'block');
			this.mouseOutHide();
			this.closeIconBtn();
		}	
	});
	
	const _hide = () => ({
		/**
		* Hide content
		*/
		hide:function(){
			if(this.open === false) return;
			this.open = false;
			this.btn.classList.remove( cssActive );
			uiApp.hide(this.content);
		}
	});
	
	const _closeIconBtn = () => ({
		closeIconBtn: function(){
			this.wrapper.querySelector('.close-icon-btn').addEventListener('mousedown',(ev) => {
				ev.stopPropagation();
				this.hide();
			},{once:true});
		}
	});
	
	const _mouseOutHide = () => ({
		/**
		* Enhanced behaviour for mouse/trackpad
		*/
		mouseOutHide: function(){
			this.wrapper.addEventListener('mouseleave',(ev) => {
				ev.stopPropagation();
				this.hide();
			},{once:true});
		}
	});
	
	const _positionContent = () => ({
		positionContent:function(){
			this.defaultCSS = this.defaultCSS || this.content.className;

			// CSS needs setting up to sort UI layout
			let btn = this.btn.getBoundingClientRect();
			let content = uiApp.getHiddenElemSize(this.content);
			let css,top,left;
	
			if(btn.top < 400){
				css = "top";
				top =  btn.top;
			} else {
				css ="bottom";
				top = btn.bottom - content.h; 
			}
			
			if(btn.left < 500){
				css += "-left";
				left = btn.left;
			} else {
				css += "-right";
				left = btn.right - content.w;
			}
			
			this.content.className = this.defaultCSS + " " + css;
			this.content.style.top = top + 'px';
			this.content.style.left = left + 'px'; 
		}		
	});
	
	/**
	* shortcuts singleton 
	* (using IIFE to maintain code pattern)
	*/
	const FilterOption = ( me ) => {
		return Object.assign( me,
			_change(),
			_show(),
			_hide(),
			_mouseOutHide(),
			_closeIconBtn(),
			_positionContent());
	};


	/**
	* Callback for Event (header btn)
	* @param {event} event
	*/
	const userClick = (ev) => {

		let btn = ev.target;
		let dataAttr = uiApp.getDataAttr(btn);
		if(dataAttr){
			/*
			Setup already, change it's state
			*/
			states[parseFloat(dataAttr)].change();
		} else {
			/*
			Collapsed Data is generally collapsed (hidden)
			But this can be set directly in the DOM if needed
			*/
			let parent = uiApp.getParent(btn, '.oe-filter-options');
			let filter = FilterOption({	btn: btn,
										wrapper: parent,
										content: parent.querySelector('.filter-options-popup') });
				
			filter.show(); // user has clicked, update view	
			uiApp.setDataAttr(btn, states.length); // flag on DOM										
			states.push(filter); // store state			
		}
	};

	// Regsiter for Events
	uiApp.userDown('.oe-filter-options .oe-filter-btn', ev => userClick(ev) );	
	
})( bluejay ); 
/*
Lightning (Document Viewer page)
Updated to Vanilla JS for IDG
*/

(function (uiApp) {

	'use strict';	
	
	const lightning = uiApp.addModule('lightning');	
	
	if(document.querySelector('.oe-lightning-viewer') === null) return;
	
	/*
	Methods	
	*/
	const _updateView = () => ({
		updateView: function(id){
			this.updateStack(id);
			this.updateMeta(document.querySelector(this.iconPrefix + id).dataset.meta);
		}
	});
	
	const _updateMeta = () => ({
		updateMeta: function(meta){
			let div = document.querySelector('.lightning-meta');
			let info = meta.split(',');
			['.type','.date','.who'].forEach((item, index) => {
				div.querySelector(item).textContent = info[index];
			});
		}
	});
	
	const _updateStack = () => ({
		updateStack: function(stackID){
			uiApp.hide(document.querySelector(this.stackPrefix + this.currentStack));
			uiApp.show(document.querySelector(this.stackPrefix + stackID), 'block');
			this.currentStack = stackID; // track id
			this.updateCounter();
			this.timelineIcon();
		}
	});
	
	
	const _updateCounter = () => ({
		updateCounter: function(){
			document.querySelector('.lightning-ui .stack-position').textContent = this.currentStack+1 + '/' + this.totalStackNum;
		}
	});

	const _timelineIcon = () => ({
		timelineIcon: function(){
			document.querySelector('.icon-event').classList.remove('js-hover');
			document.querySelector(this.iconPrefix + this.currentStack).classList.add('js-hover');	
		}
	});
	
	/*
	xscroll using DOM overlay (rather than the image)
	(note: the overlay has 2 possible widths depending on browser size)
	*/
	const _xscroll = () => ({
		xscroll: function(xCoord,e){
			var xpos = Math.floor(xCoord/(this.xscrollWidth / this.totalStackNum));
			if(this.locked == false){
				this.updateView( xpos );
			} 
		}
	});
	
	const _swipeLock = () => ({
		swipeLock: function(){
			this.locked = !this.locked;
			let help = document.querySelector('.lightning-ui .user-help');
			if(this.locked){
				help.textContent = 'Swipe is LOCKED | Click to unlock';
			} else {
				help.textContent = 'Swipe to scan or use key RIGHT / LEFT | Click to LOCK swipe';
			}
		}
	});

	const _stepThrough = () => ({
		stepThrough: function(dir){
			var next = this.currentStack + dir;
			if( next >= 0 && next < this.totalStackNum){
				this.updateView(next);
			}
		}
	});
	

	/**
	* singleton 
	* (using IIFE to maintain code pattern)
	*/
	const app = (() => {
		return Object.assign({	
			currentStack: 0,
			iconPrefix: '#lqv_',
			stackPrefix: '#lsg_',
			totalStackNum: document.querySelectorAll('.stack-group').length,
			xscrollWidth: document.querySelector('.lightning-view').clientWidth,
			locked: true
		},
		_updateView(),
		_updateMeta(), 
		_updateStack(),
		_updateCounter(),
		_timelineIcon(),
		_xscroll(),
		_swipeLock(),
		_stepThrough());
	})();
	
	
	/*
	setup viewer	
	*/
	app.updateCounter();
	app.swipeLock();
	
	/*
	Events	
	*/
	uiApp.userDown('#lightning-left-btn', () => app.stepThrough(-1));
	uiApp.userDown('#lightning-right-btn', () => app.stepThrough(1));
	uiApp.userDown('.lightning-view', () => app.swipeLock());
	uiApp.userDown('.icon-event', () => app.swipeLock());
	
	uiApp.userEnter('.icon-event', (ev) => {
		let icon = ev.target;
		app.updateStack( icon.dataset.id );
		app.updateMeta( icon.dataset.meta );
	});
	
	const view = document.querySelector('.lightning-view');
	view.addEventListener('mousemove', (ev) => {
		//app.xscroll(e.pageX - offset.left,e);
	});
	
	uiApp.listenForResize(() => app.xscrollWidth = view.clientWidth);

	document.addEventListener('keydown', (ev) => {
		if ((ev.keyCode || ev.which) == 37) app.stepThrough(-1);
		if ((ev.keyCode || ev.which) == 39) app.stepThrough(1);
	});
		
		
})(bluejay); 

(function (uiApp) {

	'use strict';	
	
	uiApp.addModule('lightningIconGroups');
	
	const iconGroups = uiApp.nodeArray(document.querySelectorAll('.icon-group'));
	if(iconGroups.length < 1) return;
	
	iconGroups.forEach((group) => {
		let count = group.childElementCount;
		let div = document.createElement('div');
		div.textContent = '(' + count + ')';
		uiApp.hide(div);
		group.parentNode.appendChild(div);
	});
	
	const collapseTimeline = (ev) => {
		let icon = ev.target;
		let group = document.querySelector('#js-icon-' + icon.dataset.icons);
		if(icon.classList.contains('collapse')){
			uiApp.hide(group);
			uiApp.show(group.nextElementSibling, 'block');
			icon.classList.replace('collapse','expand');
		} else {
			uiApp.show(group, 'block');
			uiApp.hide(group.nextElementSibling);
			icon.classList.replace('expand','collapse');
		}
	};
	
	/*
	Events 
	*/
	uiApp.userDown('.js-timeline-date', collapseTimeline);
	
})(bluejay); 
(function (uiApp) {

	'use strict';	
	
	uiApp.addModule('multiPageScroll');
	
	/*
	Mulit Page Scroll Widget. 
	Used in Correspondence VIEW and Lightning Viewer for Letters 
	... and maybe other places too.
	Currently only an IDG thing tho.
	*/
	
	let multiPageScroll = uiApp.nodeArray(document.querySelectorAll('.lightning-multipage-scroll'));
	if( multiPageScroll.length ===  0 ) return;	


	const _animateScrollTo = () => ({
		animateScrollTo:function(pageNum){
			const easeInOutQuad = t => t<0.5 ? 2*t*t : -1+(4-2*t)*t;
			const duration = 80; // num of animation steps
			let step = 1;	
			let time = 0;
			let startPos = this.stack.scrollTop;
			let endPos = (this.pageH * pageNum) - startPos;
			// first clear any running animation
			clearInterval(this.animateID);
			// set up the animation		
			this.animateID = setInterval(() => {
				time = Math.min(1, (step/duration));
				this.stack.scrollTop = Math.ceil((easeInOutQuad(time) * endPos)) + startPos;
				step = step + 1; // increment animation
				if(time == 1) clearInterval(this.animateID); 
			}, 2);
		}
	});
	
	const _pageBtn = () => ({
		pageBtn:function(btn){
			if(btn.matches('.page-num-btn')){
				this.animateScrollTo(parseFloat(btn.dataset.page));
			}
		}
	});

	const PageScroller = (me) => {
		me.numOfImgs = me.stack.querySelectorAll('img').length;
		/*
		Get first IMG height Attribute to work out page scrolling.
		Note: CSS adds 10px padding to the (bottom) of all images !
		*/
		me.pageH = parseFloat(me.stack.querySelector('img').height + 10);
		me.animateID = null;
		/*
		Build Page Nav Page scroll btns
		e.g. <div class="page-num-btn">1/4</div>
		*/	
		let frag = new DocumentFragment();

		for(let i = 0; i < me.numOfImgs; i++){
			let btn = document.createElement('div');
			btn.className = "page-num-btn";
			btn.setAttribute('data-page', i);
			btn.textContent = (i+1) + "/" + me.numOfImgs;
			frag.appendChild(btn);
		}
		
		me.nav.appendChild(frag);
		me.nav.addEventListener('mouseenter', (ev) => me.pageBtn(ev.target), {capture:true});
		me.nav.addEventListener('mousedown', (ev) => me.pageBtn(ev.target), {capture:true});

		return Object.assign(	me,
								_pageBtn(),
								_animateScrollTo() );
	};

	multiPageScroll.forEach((mps) => {
		PageScroller({	nav: mps.querySelector('.multipage-nav'),
						stack: mps.querySelector('.multipage-stack')
		});	
	});
	
	
	
})(bluejay); 
(function( bj ) {
	
	'use strict';
	
	bj.addModule('oesLayoutOptions'); 
	
	const dataLayoutElem = document.querySelector('.oes-hd-data-layout');
	
	// check for DOM...
	if( dataLayoutElem == null ) return; 
	
	/** 
	* Model
	* extended with views
	*/	
	const model = Object.assign({ 
		selector: {
			rootElem: 	'.oes-hd-data-layout',
			btn: 		'.oes-hd-data-layout .layout-select-btn',
			optionBtn: 	'.oes-hd-data-layout .option-btn',
			options: 	'.layout-options',
		},
		
		current: {
			eye: JSON.parse( dataLayoutElem.dataset.oes ).eyeIcons,
			layout: JSON.parse( dataLayoutElem.dataset.oes ).layout,
		},

		get eye(){
			return this.current.eye;
		}, 
		
		set eye( val ){
			if( val === this.current.eye ) return false;
			this.current.eye = val;
			this.views.notify();
		},
		
		get layout(){
			return this.current.layout;
		},
		
		set layout( val ){
			if( this.current.layout === val) return false;
			this.current.layout = val;
			this.views.notify();
		}
	
	}, bj.ModelViews());
	
	
	/**
	* Build DOM for eye and layout options and insert for user selection
	*/
	const buildOptions = (() => {
		// Mustache template
		const template = [
			'{{#sides}}',
			'<div class="option-btn" data-oes=\'{"opt":"eye.{{eyelat.r}}-{{eyelat.l}}"}\'><span class="oe-eye-lat-icons"><i class="oe-i laterality {{eyelat.r}} small"></i><i class="oe-i laterality {{eyelat.l}} small"></i></span></div>',
			'{{/sides}}',
			'{{#layouts}}',
			'<div class="option-btn" data-oes=\'{"opt":"layout.{{.}}"}\'><i class="oes-layout-icon i-{{.}}"></i></div>',
			'{{/layouts}}',
		].join('');
		
		// build layout DOM
		const div = document.createElement('div');
		div.className = model.selector.options.replace('.','');
		div.innerHTML = Mustache.render( template, {
			'sides' : [
				{ eyelat: { r:'R', l:'NA'}},
				{ eyelat: { r:'R', l:'L'}},
				{ eyelat: { r:'NA', l:'L'}}
			],
			'layouts' : ['1-0', '2-1', '1-1', '1-2', '0-1'], 
		} );
		
		bj.hide( div );
		dataLayoutElem.appendChild( div );
		
	})();

	/** 
	* View 
	* show current state of model in UI
	*/
	const currentState = (() => {
		// btn DOM elements
		const css = {
			layout: 'oes-layout-icon'
		};
		
		const layoutBtn = document.querySelector( model.selector.btn );
		const layout = layoutBtn.querySelector( '.' + css.layout );
		const eyelat = layoutBtn.querySelector( '.oe-eye-lat-icons' );

		const iconTemplate ='{{#eyes}}<i class="oe-i laterality {{.}} small pad"></i>{{/eyes}}';
		
		/**
		*  make sure UI reflects model updates
		*/
		const update = () => {
			
			layout.className = css.layout + '  i-' + model.layout;
			let eyes = model.eye.split('-'); 
			eyelat.innerHTML = Mustache.render( iconTemplate, { eyes });
			
			// other JS may be updating on this.
			bj.customEvent('oesLayoutEyeSide', eyes );
		};
		
		// add to observers
		model.views.add( update );
		
	})();
	
	
	const oesSides = (() => {
		// dom side divs
		let layout = null;
		const right = document.querySelector('.oes-v2 .oes-right-side');
		const left = document.querySelector('.oes-v2 .oes-left-side');
		
		/**
		* set layout proportions to match the model
		*/
		const resize = () => {
			if(model.layout === layout) return; 
			layout = model.layout;
		
			// options (see buildOptions above)
			// ['1-0', '2-1', '1-1', '1-2', '0-1']
			switch( layout ){
				case '1-0': 
					left.style.width = "";
					bj.show( left );
					bj.hide( right );			
				break;
				case '0-1': 
					right.style.width = "";
					bj.hide( left );
					bj.show( right );			
				break;
				case '2-1':
					left.style.width = "66%"; 
					right.style.width = "33%";
					bj.show( left );
					bj.show( right );			
				break;
				case '1-2':
					left.style.width = "33%"; 
					right.style.width = "66%";
					bj.show( left );
					bj.show( right );			
				break;
				case '1-1':
					left.style.width = "50%"; 
					right.style.width = "50%";
					bj.show( left );
					bj.show( right );			
				break;
				
				default: 
					throw new TypeError('[bluejay] [oesLayoutOptions] - unknown layout: ' + layout);
			}
			
			bj.customEvent('oesLayoutChange', layout);
		};
		
		// make widths are set correctly on initalisation
		resize();
		
		// add to observers
		model.views.add( resize );
	})();
	
	
	/** 
	* View 
	* Data and Layout options bar
	*/
	const options = (() => {
		
		let showing = false;
		const btn = dataLayoutElem.querySelector(  model.selector.btn );
		const elem = dataLayoutElem.querySelector( model.selector.options );
		
		/**
		* Event callbacks
		*/
		const show = ( ev ) => {
			showing = true;
			bj.show( elem); 
			btn.classList.add('active'); 
		};
		
		const hide = ( ev ) => {
			showing = false;
			bj.hide( elem );
			btn.classList.remove('active'); 
		}; 
		
		const change = ( ev ) => {
			if( showing ){
				hide();
			} else {
				show();
			}
		};
		
		// public
		return { show, hide, change };
				
	})();

	/**
	* Handler
	* @param {JSON} dataAttr - see Mustache template above
	*/
	const requestOption = ( dataAttr ) => {
		let json = JSON.parse( dataAttr ); 
		let arr = json.opt.split('.');
	
		if( arr[0] == 'eye' ) model.eye = arr[1];
		if( arr[0] == 'layout' ) model.layout = arr[1];
		
	};
	
	/**
	* Events
	*/
	bj.userDown( model.selector.btn, options.change );
	bj.userEnter( model.selector.btn, options.show );
	bj.userLeave( model.selector.rootElem, options.hide );
	// select an option 
	bj.userDown( model.selector.optionBtn, ( ev ) => requestOption( ev.target.dataset.oes ) );
	
	
})( bluejay ); 
(function (uiApp) {

	'use strict';
	
	uiApp.addModule('problemsPlans');

	/*
	Assumes that the "problems-plans-sortable"	<ul>
	is already in the DOM and not dynamically loaded. 
	Note: in Patient Overview the same list is editable in
	TWO places the popup and in main page area.
	*/
	const pps = uiApp.nodeArray(document.querySelectorAll('.problems-plans-sortable'));
	if(pps.length < 1) return; 
	
	/*
	list state for Problems and Plans Lists
	(this can be JSON'd back to server)
	*/
	const listMap = [];
	const mapObj = (id,text,info) => ({id:id,text:text,info:info});
	/*
	only need to use first list to set up 
	if more (two) they should be identical!
	*/
	uiApp.nodeArray(pps[0].querySelectorAll('li')).forEach((li)=>{
		listMap.push( mapObj(	listMap.length,
								li.textContent,
								li.querySelector('.info').getAttribute('data-tooltip-content') 
							)
		);
	});
	
	// updated all DOM <li>'s with uniqueIDs
	pps.forEach((list) => {
		uiApp.nodeArray(list.querySelectorAll('li')).forEach((li,index) => {
			uiApp.setDataAttr(li,index);
		});
	});
	
	// use a unique id for each new DOM list added, using this for basic DOM diffing 
	let listUID = listMap.length+1;  
	
	/**
	* loop through and check DOM against listMap 
	*/
	const reorderDOM = () => {
		pps.forEach((list) => {
			let listNodes = list.querySelectorAll('li');
			for(let i=0, len=listMap.length; i<len; i++){
				let map = listMap[i];
				let li = listNodes[i];
				
				// check list<ap and dom match up
				if(map.id != uiApp.getDataAttr(li)){
					// nope, update DOM attribute
					uiApp.setDataAttr(li, map.id);
					// update list content 
					li.innerHTML = domString(map.text, map.info);
				}
			}
		});
	};
	
	/**
	* Add new List item to the DOM(s)
	* @param {DocFragment} frag - new <li>
	* @param {Number} id - unique List id 
	*/
	const addToDOM = (frag, id) => {
		pps.forEach((list) => {
			list.appendChild(frag.cloneNode(true));
			makeDraggable(list.lastChild);  // now it's inserted in the DOM, set up listeners
		});
	};
	
	/**
	* Build <li> innerHTML domString
	* @param {String} text - <li> text to show
	* @param {String} info - text for the info icon tooltip
	* @returns {String}
	*/
	const domString = (text,info) => {
		return [	'<span class="drag-handle"><i class="oe-i menu medium pro-theme"></i></span>',
					text,
					'<div class="metadata">',
					'<i class="oe-i info small pro-theme js-has-tooltip" data-tooltip-content="',
					info,
					'"></i></div>',
					'<div class="remove"><i class="oe-i remove-circle small pro-theme pad"></i></div>'
					].join('');
	};
	
	/**
	* Create New <li> Fragment for insertion
	* @param {Object} obj - new listMap Obj 
	* @returns {DOMFragment}
	*/
	const domFragment = (obj) => {
		const fragment = new DocumentFragment();
		const li = document.createElement('li');
		li.innerHTML = domString(obj.text, obj.info);
		uiApp.setDataAttr(li, obj.id); 
		fragment.appendChild(li);
		
		return fragment;
	};
	
	/**
	* Callback for 'drop', update listMap based on the last drag'n'drop
	* @param {String} a - Source textContent
	* @param {String} b - textContent of Element switched with
	*/
	const updateListOrder = (aNum,bNum) => {
		let a = listMap.findIndex( e => e.id == aNum );
		let b = listMap.findIndex( e => e.id == bNum );
		listMap[a] = listMap.splice(b,1,listMap[a])[0];	
		// other lists to reorder?	
		if(pps.length > 1) reorderDOM();
	};

	/**
	* Callback for 'click' on <button> next to input field
	* @param {Event} ev
	*/
	const addListItem = (ev) => {
		ev.preventDefault(); // as <button>
		let parent = uiApp.getParent(ev.target,'.create-new-problem-plan');
		let input = parent.querySelector('input');
		if(!input || input.value.length < 2) return; 
		
		let newListItem = mapObj(listUID++, input.value, "Added now!");					
		listMap.push(newListItem); // update listMap
		addToDOM(domFragment(newListItem));	// update DOM
	};

	
	/**
	* Callback for 'click' on remove-circle icon
	* @param {Event} ev
	*/
	const removeListItem = (ev) => {
		/*
		Because of the DOM structure for <ul>, simply find 
		the node index and then remove it	
		*/
		let li = uiApp.getParent(ev.target,'li');
		let i = 0;
		while( (li = li.previousSibling) !== null ) i++;
		
		// update DOM
		pps.forEach((list) => {
			uiApp.remove(list.childNodes[i]);
		});
		
		// update listMap
		listMap.splice(i,1);
	};

	/* 
	Events
	*/
	uiApp.userDown('.create-new-problem-plan button', addListItem);
	uiApp.userDown('.problems-plans-sortable .remove-circle', removeListItem);
	
	document.addEventListener('DOMContentLoaded', () => {
		pps.forEach((list)=>{
			uiApp.nodeArray(list.querySelectorAll('li')).forEach((li)=>{
				makeDraggable(li);
			});
		});
	});

	/*
	********************************
	Drag n Drop
	********************************
	*/
	let dragSourceElement = null;
	let listDragCSSFlag = "js-sorting-list";  // add to <ul> on dragstart and restrict drops to this class

	/**
	* handle start of drag
	* @param {Event} 
	*/
	const handleStart = (e) => {
		dragSourceElement = e.target; // remove source target to swap on drop
		e.target.parentNode.classList.add(listDragCSSFlag); // flag used to control 'drop' area
		/*
		setData using a custom 'type' as only for this app. however, might need 
		to provide a fallback of "text/plain"; Using "text/html" adds a <meta>!?
		*/
		e.dataTransfer.setData('source', dragSourceElement.innerHTML);
	};
	
	const handleEnter = (e) => {
		e.dataTransfer.effectAllowed = 'move';	// use browser API effects
		e.dataTransfer.dropEffect = 'move';
	};
	
	const handleOver = (e) => {
		// To allow a drop, you must prevent default handling  (as most areas don't allow a drop)	
		if(e.preventDefault) e.preventDefault(); // Necessary. Allows Drop (if it's a link or somethink clickable!)
		return false; // good practice
	};
	
	/**
	* handle drop
	* @param {Event} 
	*/
	const handleDrop = (e) => {
		if(e.stopPropagation) e.stopPropagation(); // stops the browser from redirecting.
		/*
		Without this it would be possible to mix up 2 P'n'P lists!
		*/
		if(e.target.parentNode.classList.contains(listDragCSSFlag) === false) return;
		e.target.parentNode.classList.remove(listDragCSSFlag);

		// Make sure we are not dropping it on ourself...
		if (dragSourceElement !=  e.target) {
			dragSourceElement.innerHTML = e.target.innerHTML;       // switch them around
			e.target.innerHTML = e.dataTransfer.getData('source');
			
			// update listMap
			updateListOrder( uiApp.getDataAttr(dragSourceElement), uiApp.getDataAttr(e.target) );
		}
		return false;
	};
	
	/*
	const handleEnd = (e) => {
	  // this/e.target is the source node. clean up after dragging about!
	};
	*/

	const makeDraggable = (li) => {
		/*
		List items are not draggable by default
		*/
		li.setAttribute('draggable','true');
		li.addEventListener('dragstart',handleStart, false);
		/*
		'dragenter' & 'dragover' events are used to indicate valid drop targets.
		As the rest of the App is not a valid place to "drop" list item, 
		EventListeners need to be targeted to specific elements		
		Set up each <li> DOM to allow Drag n Drop
		*/
		li.addEventListener('dragenter',handleEnter, false);
		li.addEventListener('dragover',handleOver, false);
		li.addEventListener('drop',handleDrop, false);
		//li.addEventListener('dragend', handleEnd,false);	
		
		
		
	};
			
})(bluejay); 

(function( bj ){
	
	'use strict';
	
	bj.addModule('quicktag'); 
	
	/**
	Model
	*/
	const model = {
		// for string matching remove case.
		qtags: [ 'Adverse_Event', 'Serious_Adverse_Event', 'Note', 'My_research', 'my_teaching', 'Research', 'Teaching', 'Referred', 'Results', 'My_Results_pending' ].map( t => t.toLowerCase()), 
		
	};
	
	
	/**
	* Find and style qTags in a String
	* @param {String} str - str to check for qTags
	* @returns {Object} - raw text and HTML DOMString
	*/
	const wrapQtags = ( str ) => {
		let words = str.split(' ');
		let comments = [];
		let qtags = [];

		words.forEach(( word, index ) => {
			if( word.startsWith('#')){
				if( model.qtags.indexOf( word.substring( 1 )) >= 0 ){
					qtags.push( word ); // Offical tag! 
				} else {
					comments.push( word ); // unoffical tag e.g. '#3'
				}
			} else {
				comments.push( word );
			}
		});
		
		qtags.sort();
		
		// did we find any tags?
		if( qtags.length ){
			let styledTags = qtags.map( tag => `<span class="qtag">${tag}</span>` );	
			return {
				text: qtags.join(' ') + ' ' + comments.join(' '),
				DOMString: styledTags.join(' ') + '<span class="dot-list-divider"></span>' +  comments.join(' '),
			};
		} 
		
		// no tags found?
		return {
			text: str,
			DOMString: str,
		};
	};
	
	// make this available to other modules
	// e.g. commentsHotlist
	bj.extend('wrapQtags', wrapQtags );
	
	
	/**
	View - Quick Tag 'swarm'
	*/
	const quickTags = (() => {
		// Mustache
		const template = '{{#qtags}}<span class="qtag">#{{.}}</span> {{/qtags}}';
		
		let ready = false;
		let tag = "";
		const elem = {
			input: null,
			tags: null,
			flag: null, 
		};
		
		/**
		* Complete reset 
		*/
		const reset = () => {
			if( !ready ) return; 
			
			bj.remove( elem.tags );
			bj.remove( elem.flag );
			bj.unwrap( elem.input );
			
			elem.tags = null;
			elem.flag = null;
			elem.input = null;
			
			ready = false;
 		};
		
		/**
		* Show tag swam, hide flag
		*/
		const showTags = () => {
			elem.tags.style.display = "block";
			elem.flag.style.display = "none";
			
			// re-show with all tags (hidden)
			qtags( model.qtags );
		};
		
		/**
		* Hide tag swam, show flag
		*/
		const hideTags = () => {
			elem.tags.style.display = "none";
			elem.flag.style.display = "block";
		};
		
		/**
		* selectedTag, make this available to the controller
		* @returns {String || null}
		*/
		const selectedTag = () => tag;
		
		/**
		* Use Mustache to build tags swarm
		* @param {Array} tagArr - tag list is filtered as the user types.
		*/
		const qtags = ( tagArr ) => {
			if( tagArr.length ){
				/*
				update tags and show the selected tag
				as user types the tag swarm is filtered
				so always make the first tag as selected
				*/
				tag = tagArr[0];
				elem.tags.innerHTML = Mustache.render( template, { qtags: tagArr });
				elem.tags.querySelector('.qtag:first-child').classList.add('selected'); 
			} else {
				tag = "";
				elem.tags.innerHTML = '<div class="no-matching-tags">No matching Patient Tags</div>';
			}
		};
		
		/**
		* Controller callback on input watch
		* @param {String} userStr - starting from "#"...  
		*/
		const userTyping = ( userStr ) => {
			userStr = userStr.toLowerCase(); // clean user input
			const strMatch = userStr.match(/[a-z-_]*/)[0]; // note: [0]
			const strlen = strMatch.length;
			// filter all tags 
			const filteredTags = model.qtags.filter( tag => {
				return ( tag.substring(0, strlen) == strMatch ); 
			});
			// update 'swarm'
			qtags( filteredTags );
		};
		
		/**
		* Intialise on the input
		* Setup and provide a UI Flag on the input to let the user 
		* know that they can qtag this input
		* @param {Element} input - input or textarea to tag;
		*/
		const init = ( input ) => {
			
			if( ready ) return; 
			ready = true;	
			/*
			Using the "wrap" we can now position the div
			relativelto the wrapper. The reason behind this
			approach (rather than used "fixed") is because of 
			comments in hotlist. Using fixed causes the "mouseleave"
			to fire, closing the hotlist panel.  
			*/
			const wrap = bj.wrap( input, "js-qtag-wrapper" );
			
			// "wrap" will cause focus to be lost from the input
			input.focus();
			
			// add qtags div (hidden for now)
			let tags = document.createElement('div');
			tags.className = "oe-qtags";
			tags.style.display = "none"; 
			
			// UI flag to user
			let flag = document.createElement('div');
			flag.className = "oe-qtags-flag";
			flag.textContent = "#";
			
			/*
			check input position
			note: tag swarm updates as user types and textarea expands down
			170px allows for a few lines of comments and 3 rows of tags BELOW.
			*/
			if( input.getBoundingClientRect().top < ( bj.getWinH() - 170 )){
				tags.style.top = '100%';
				flag.style.top = '100%';
			} else {
				tags.style.bottom = '100%'; 
				flag.style.bottom = '100%';
			}
			
			// update DOM
			wrap.appendChild( flag );
			wrap.appendChild( tags ); 
			
			// store Elements
			elem.input = input;
			elem.tags = tags;
			elem.flag = flag;
			
			// setup with all tags (hidden)
			qtags( model.qtags );
		};
		
		// reveal
		return { 
			init,
			showTags,
			hideTags,
			userTyping, 
			selectedTag,
			reset, 
		};
			
	})();
	
	
	/**
	* user: keydown
	* SPACEBAR | ENTER | TAB
	* Need to use keydown because "Enter" in <input> doesn't work
	* These keys events need controlling to: 
	* - allow fast user input and match similar UI mechanisms
	* - stop their generic UI use (spacebar nudging the page down, tab changes input focus) 
	* - note: spacebar is entering a tag (not cancelling) because the tags are set in the Admin
	* @param {Event} ev
	*/
	const handleKeyDown = ( ev ) => {
		/*
		MDN: ignore all keydown events that are part of composition
		*/
		if( ev.isComposing || ev.keyCode === 229 ) return;
		
		/*
		ENTER || TAB 
		Using Enter and Tab to quickly enter the selected tab
		However, these keys have other GUI behaviours
		Also: Enter is used in patient comments to saves the hotlist comments
		*/
		if( ev.key == 'Enter' || ev.key == 'Tab' ){
			ev.preventDefault();
			ev.stopPropagation();
			inputController.insertTag( quickTags.selectedTag() );		
		} 
		
		/*
		SPACEBAR 
		cancel the current quick tagging
		this allows users to type: '#3 injections'
		*/
		if( ev.key == ' ' ){
			inputController.stopTagging();
		}
		
	};
	
	
	/**
	* Controller for inputs
	*/
	const inputController = (() => {
		
		let tagging = false;
		let input = null;
		let insertIndex = 0;
		let inputText = "";
		let holdingFocus = false;
		
		/**
		* full reset of controller and quicktags
		*/
		const reset = () => {
			// cancel events first
			document.removeEventListener('input', watchInput, { capture:true });
			document.removeEventListener('blur', focusOut, { capture: true });
			
			// now reset everything...
			input = null;
			tagging = false;
			insertIndex = 0;
			quickTags.reset();
		};
		
		/**
		* Ready to quick tag
		* and: Callback on the qTag close btn
		*/
		const stopTagging = () => {
			tagging = false;
			insertIndex = 0;
			quickTags.hideTags();
			
			bj.log('[qTags] - Keys: Enter, Tab and Spacebar - normal');
			document.removeEventListener("keydown", handleKeyDown, true );
		};
		
		/**
		* Start quick tagging
		* @param {Number} tagIndex - character position (selectionStart)
		*/
		const startTagging = ( tagIndex ) => {
			// setup for tagging
			tagging = true;
			insertIndex = tagIndex;
			inputText = input.value;
			// this will show all default tags
			quickTags.showTags();
			
			bj.log('[qTags] - Keys: Enter, Tab & Spacebar - suspended (keydown)');
			document.addEventListener("keydown", handleKeyDown, true ); // Important. Must intercept all other key events first
		};
		
		/**
		* Callback from 'keydown' or .qtag 'mousedown'
		* @param {String} tag - without '#'
		*/
		const insertTag = ( tag ) => {	
			let str = tag + ' ';
			if( insertIndex === inputText.length ){
				// add to the end
				input.value = inputText + str;
			} else {
				// insert in the middle
				input.value = inputText.substring( 0, insertIndex ) + str + inputText.substring( insertIndex + 1 );
			}
			stopTagging();
		};   
		
		/**
		* refocus input after a small delay
		* user clicking on qtags flag or tag causes input blur
		* need to hold focus and cancel focusout event
		*/
		const delayInputFocus = () => {
			holdingFocus = true;
			setTimeout(() => {
				input.focus();
				holdingFocus = false;
			}, 20 );
			
		};
		
		/**
		* Callback: User clicks '#' UI flag button
		* setup input and startTagging
		* note: this trigger "focusout" Event
		*/ 
		const userClicksFlag = () => {
			input.value = input.value + ' #';
			startTagging( input.value.length );
			delayInputFocus();
		};
		
		/**
		* Callback: User clicks on a tag
		* insert Tag into input
		* note: this trigger "focusout" Event
		*/ 
		const userClicksTag = ( tagStr ) => {	
			inputController.insertTag( tagStr );
			delayInputFocus();
		};
		
		/**
		* Focus out.
		* Needed due to the comments in the hotlist
		* Users can toggle the icon to edit and save the comments
		* Need to capture the lose of focus to reset.
		*/
		const focusOut = () => {
			if(	holdingFocus ) return;
			reset();
		};
		
		/**	
		* Callback 'input' event
		* watching ALL input events, using Event Delegation
		* note: user could TAB to get to this input
		* @param {Event} ev - input (textarea, input or select)
		*/
		const watchInput = ( ev ) => {
			if( tagging ){
				/*
				Tagging active - watching user typing
				*/
				quickTags.userTyping( input.value.substring( insertIndex )); 
				
			} else if( ev.data === "#" ){
				/*
				key '#' triggers the tagging 
				store the cursor position
				*/
				startTagging( ev.target.selectionStart ); 
			}
		};
		
		/**
		* Init: Callback on 'focusin' event
		* @param {Element} target - any input
		*/
		const init = ( target ) => {
			/*
			When qTags are inititate, input loses focus and then 
			re-gains it, beware this loop.
			*/
			if( target.isSameNode( input )) return;
			
			// Reset only if we already have an active input setup			
			if( input !== null ) reset();
			
			// is new target allow to use tags?
			if( target.classList.contains("js-allow-qtags") ){
				input = target;
				// add UI flag to input
				quickTags.init( input ); 
				document.addEventListener('input', watchInput, { capture:true });
				document.addEventListener('blur', focusOut, { capture: true });	
			}		
		};
		
		// reveal
		return { 
			init,
			stopTagging, 
			insertTag, 
			userClicksFlag,
			userClicksTag,
			reset,
			focusOut,
		};
		
	})();

	/**
	Events
	*/
	
	// custom event delegation
	document.addEventListener('focus', ( ev ) => inputController.init( ev.target ), { capture: true });
	
	// common event delegation
	bj.userDown('.oe-qtags', inputController.stopTagging );
	bj.userDown('.oe-qtags-flag', inputController.userClicksFlag );
	
	// .qtag in .oe-qtags can be click to insert the tag:
	bj.userDown('.oe-qtags .qtag', ( ev ) => {
		const tagStr = ev.target.textContent;
		inputController.userClicksTag( tagStr.substring(1));
	});
	
})( bluejay ); 
(function (uiApp) {

	'use strict';	
	
	uiApp.addModule('reduceElementHeight');	
	
	const states = [];
	
	/*
	Methods	
	*/
	const _change = () => ({
		/**
		* Change state 
		*/		
		change: function(){	
			if(this.reduced){
				this.elem.classList.remove('reduced-height');
				this.icon.classList.replace('increase-height-orange','reduce-height');	
			} else {
				this.elem.classList.add('reduced-height');
				this.icon.classList.replace('reduce-height','increase-height-orange');
			}
			
			this.reduced = !this.reduced;
		}
	});
	
	/**
	* @Class
	* @param {Object} me 
	* @returns new Object
	*/
	const ReduceHeight = (me) => {
		me.reduced = false;
		return Object.assign(	me, 
								_change() );
	};

	/**
	* Callback for Event (header btn)
	* @param {event} event
	*/
	const userClick = (ev, defaults) => {
		let icon = ev.target;
		let dataAttr = uiApp.getDataAttr(icon);
		
		if(dataAttr){
			/*
			Setup already, change it's state
			*/
			states[parseFloat(dataAttr)].change();
		} else {
			/*
			Collapsed Data is generally collapsed (hidden)
			But this can be set directly in the DOM if needed
			*/
			let reducer = ReduceHeight( {	elem: uiApp.getParent(icon,'.element'),
											icon: icon });
				
			reducer.change(); 		// user has clicked, update view
			uiApp.setDataAttr(icon, states.length);											
			states.push(reducer); 	// store state			
		}
	};

	uiApp.userDown('.element .js-elem-reduce .oe-i', userClick );
	
})(bluejay); 
(function (uiApp) {

	'use strict';
	
	uiApp.addModule('restrictDataHeightFlag');
	
	/*
	Restrict Data Height User Flag 
	Tile Element data (in SEM) and "Past Appointments"
	can be very long lists. There high is restricted by 
	CSS but the data overflow needs visually flagged so 
	as not to be missed.
	CSS restricts height by 'rows' e.g. 'rows-10','rows-5'
	*/
	
	const css = {
		flag: 'restrict-data-shown-flag'
	};
	
	const dataAttrName = uiApp.getDataAttributeName();
	const store = []; // store instances
	
	/**
	* @class 
	* @param {DOMElement} flag
	* @param {DOMElement} content
	* @param {number} endPos
	* @private
	*/
	function Flag(flag, content, endPos){
		this.hasScrolled = false; // aware of scrolled data?
		this.flag = flag;
		this.content = content;
		this.scrollEndPos = endPos;
		this.content.addEventListener("scroll",() => this.scroll(), {once:true});
	}

	/**
	* User scrolls (they're aware of the extra data)
	* @param {Event} e
	*/
	Flag.prototype.scroll = function(e){
		// note! Either animation OR user scrolling will fire this!
		this.hasScrolled = true; 
		this.flag.className += " fade-out"; 
		setTimeout(() => uiApp.remove(this.flag), 400); 	// CSS fade-out animation lasts 0.2s
	};

	/**
	* Animate the scroll down to end 
	* @method
	*/ 
	Flag.prototype.userClick = function(){
		if(this.hasScrolled) return;
		animateScroll(this.content,this.scrollEndPos); // this will fire the scroll eventListener
	};
		
	/**
	* Simple scroll animation
	* @param {DOMElement} content
	* @param {numnber} endPos of scrolling
	*/		
	const animateScroll = (content,endPos) => {
		const easeOutQuad = (t) => t * (2 - t);
		const duration = 200; // num of steps
		let step = 1;	
		let time = 0;	
		// set up the animation		
		let id = setInterval(() => {
			time = Math.min(1, (step/duration));
			content.scrollTop = Math.ceil((easeOutQuad(time) * endPos));
			step = step + 1; // increment animation
			if(time == 1) clearInterval(id); 
		}, 2);
	};	

	/**
	* 'click' callback
	* @param {Event} event
	*/
	const userClicksFlag = (event) => {
		let flag = store[event.target.getAttribute(dataAttrName)];
		flag.userClick();
	};
	
	/**
	* Initialise: setup DOM Elements
	* wrapped as it might need calling on a UI update
	*/
	const init = () => {
		let restrictedData = uiApp.nodeArray(document.querySelectorAll('.restrict-data-shown'));
		if(restrictedData.length < 1) return; // no elements! 
		
		/*
		Set up a DOM fragment for Elements	
		*/
		const fragment = document.createDocumentFragment();
		const div = document.createElement("div");
	    div.className = css.flag; 
	    fragment.appendChild(div);
	    
		/*
		Check Elements to see if do scroll
		If they do then set up the UI Flag	
		*/
		restrictedData.forEach( (elem) => {
			let content = elem.querySelector('.restrict-data-content');
			let elemHeight = elem.clientHeight; 
			let scrollHeight = content.scrollHeight; 
			
			// does it scroll?
	 		if(scrollHeight > elemHeight && content.scrollTop === 0){
				/*
				Overflow, clone the fragment and pass to Flag
				*/
				let clone = fragment.cloneNode(true);
				let elemDiv = clone.firstChild; 
				elemDiv.setAttribute(dataAttrName, store.length);
				elem.appendChild(clone);
				
		 		store.push( new Flag( 	elemDiv, 
		 								content, 
		 								scrollHeight - elemHeight) );
	 		}
		});
	};
	
	// init DOM Elements
	init();
	
	// register Events
	uiApp.userDown('.' + css.flag, userClicksFlag);
	
	
})(bluejay); 
(function (uiApp) {

	'use strict';	
	
	uiApp.addModule('sideNavSelectList');	
	
	/*
	Side Nav Select List filtering
	Used in Worklist, Messages, Trials, etc
	Anywhere you have a bunch of "lists" that need filtering. 
	*/
	
	const listFilters = uiApp.nodeArray(document.querySelectorAll('.js-list-filter'));
	if(listFilters.length == 0) return;
	
	const allLists = uiApp.nodeArray(document.querySelectorAll('.js-filter-group'));
	
	// 'All' should always be selected by default	
	let activeFilter = document.querySelector('.js-list-filter.selected'); 
	
	/**
	* update the lists shown
	* @param {string} listID 
	*/
	const updateListView = (listID) => {
		if(listID == "all"){
			allListsDisplay('block');
		} else {
			allListsDisplay('none');
			uiApp.show(document.querySelector('#'+listID), 'block');
		}
	};
	
	/**
	* Change all the list display
	* @param {string} display - 'block' or 'none'
	*/
	const allListsDisplay = (display) => {
		allLists.forEach((list) => {
			list.style.display = display; 
		});
	};	
	
	/**	
	Not using delagation here because each filter
	link in the sideNav list is an <a>, easier to 
	handle Event here as we need to preventDefault
	*/
	listFilters.forEach((filter) => {
		filter.addEventListener('click', (ev) => {
			ev.preventDefault();
			let link = ev.target;
			link.classList.add('selected');
			updateListView(link.dataset.list);
			activeFilter.classList.remove('selected');
			activeFilter = link;	
		});
	});
 		

})(bluejay); 
(function (uiApp) {

	'use strict';	
	
	uiApp.addModule('sidebarElementList');	
	

	/*
	Build sidebar element list in EDIT mode
	Run through Elements grab there titles and then display them	
	*/	
	// get the <UL> wrapper
	let ul = document.querySelector('.sidebar-eventlist .oe-element-list');
	if(ul === null) return;
	
	
	// pretty sure only this class is used here
	let elemTitles = document.querySelectorAll('.element-title');
	if(elemTitles.length < 1) return;
	
	// avoid reflow until necessary
	let fragment = document.createDocumentFragment();

	elemTitles.forEach( (function(title){
		let li = document.createElement('li');
		li.innerHTML = '<a href="#">'+title.textContent+'</a>';
		fragment.appendChild(li);		
	}));
	
	// add the DOM list
	ul.appendChild(fragment);
	

})(bluejay); 
(function( bj ){

	'use strict';	
	
	bj.addModule('sidebarQuicklookView');
	/*
	This handles the displaying of Quicklook/QuickView elements in the SEM Event sidebar
	Quicklook DOM is prebuilt in DOM, QuickView (lightning) is built by JS on request.		
	The event sidebar can be re-ordered and filtered, but this should not affect that.
	
	There can only be one sidebar 'quicklook' open (tooltip for sidebar element)
	and only one quickview (the big popup that shows more lightning view of Event)
	
	DOM
	ul.events -|- li.event -|
	                        |- .tooltip.quicklook (hover info for event type)
	                        |- <a> -|- .event-type
	                                |- .event-extra (for eyelat icons)
	                                |- .event-date
	                                |- .tag
	
	DOM data attributes:
	<li> -|- data-id = "0000001" // OE (this repeated on <a> child)
	      	|- data-quick = JSON that provides all the bits we need.
	
	Event sidebar only exists on SEM pages:
	*/
	if( document.querySelector('.sidebar-eventlist') === null ) return;

	/**
	* Quicklook, the little tooltip underneath <li>, in the DOM but hidden.
	*/
	const quicklook = {
		el:null, 
		show( eventType ){
			// !! relies on the current DOM structure
			this.el = eventType.parentNode.previousSibling; 
			this.el.classList.add('fade-in');
		},
		hide(){
			this.el.classList.remove('fade-in');
		}
	};

	/**
	* Quickview, big popup preview.
	* DOM struture is built dymnamically and content from JSON.
	*/
	const quickview = {
		
		id:null,
		div:null,
		locked:false,
		iCloseBtn: 'i-btn-close',
		
		// primary action (for touch)
		click( json ){
			if( json.id == this.id ){
				// Quick view is already open...
				if( this.locked ){
					this.unlock();
				} else {
					this.lock();
				}
			} else {
				// touch device (no "hover")
				this.show( json );	
				this.lock();
			}
		},
		
		// mouse/track pad UX enhancement
		over( json ){
			if( this.locked ) return; // ignore
			this.show( json );
		},
		out(){
			if( this.locked ) return; // ignore
			this.remove();
		},
		
		// click behaviour
		lock(){
			this.locked = true;
			this.div.appendChild( bj.div(`${this.iCloseBtn}`));
		},
		unlock(){
			this.locked = false;
			this.div.querySelector(`.${this.iCloseBtn}`).remove();
		},
		
		// User clicks on the close icon button
		close(){
			this.remove();
			this.locked = false;	
		},
		
		// remove DOM, and reset
		remove(){
			// this.div.classList.add('fade-out'); // CSS fade-out animation lasts 0.2s
			this.div.remove();
			this.div = null;
			this.id = null;
		},
		
		/**
		Show the QuickView content
		There should only be one QuickView open at anytime
		*/
		show( json ){
			if( this.div !== null ) this.remove();
	
			this.id = json.id;
			
			const template =  [
				'<div class="event-icon"><i class="oe-i-e large {{icon}}"></i></div>',
				'<div class="title">{{event}} - {{date}}</div>',
				'<div class="quick-view-content {{type}}"></div>'
			].join('');
			
			this.div = bj.div('oe-event-quickview fade-in');
			this.div.innerHTML = Mustache.render( template, json );
			
			this.load( json.type, json.content );

			// append div, and wait to load PHP content	
			document.body.appendChild( this.div );
		},
		
		/**
		Load the QuickView content
		*/
		load( type, content ){
			const contentDiv = this.div.querySelector('.quick-view-content');
			switch( type ){
				case 'img': 
					contentDiv.innerHTML = `<img src="${content}" />`;
				break;
				case 'pdf': 
					contentDiv.innerHTML = `<embed src="${content}#toolbar=0" width="100%" height="100%"></embed>`;
				break;
				case 'php': 
					bj.xhr( content, this.id )
						.then( xreq => {
							// check user hasn't move on whilst we were loading in
							if( this.id != xreq.token ) return; 
							contentDiv.innerHTML = xreq.html;
						})
						.catch(e => console.log('PHP failed to load',e));
				break;
				case "none":
					contentDiv.innerHTML = `<div class="not-available">${content}</div>`;
				break;
				/* case 'v3': 
					this.v3DOM( content ); // to check the old DOM is still supported by the CSS, test on an IMG
				break; */
				default: bj.log('QuickView Error - load content type unknown:' + type);
			}
		},
/*
		v3DOM( src ){
			const oldDOM = [
				'<div class="event-quickview">',
				'<div class="quickview-details">',
				'<div class="event-icon"><i class="oe-i-e large i-CiExamination"></i></div>', 
				'<div class="event-date"></div>', // not used!
				'</div>', // .quickview-details
				'<div class="quickview-screenshots">',
				'<img class="js-quickview-image" src="{{imgSrc}}">',
				'</div>', // .quickview-screenshots
				'</div>', // .event-quickviews	
			].join('');
			this.div.innerHTML = Mustache.render( oldDOM, { imgSrc: src });
		}
*/
	};
	
	/*
	Event delegation
	*/
	bj.userEnter('.event .event-type', (ev) => {	
		quicklook.show( ev.target );
		// quick view JSON is held in <li> parent
		const li = bj.getParent( ev.target, 'li.event' );
		quickview.over( JSON.parse( li.dataset.quick ));	
	});	
																				
	bj.userLeave('.event .event-type', (ev) => {
		quicklook.hide(); 
		quickview.out();	
	});

	bj.userDown(`.oe-event-quickview .${quickview.iCloseBtn}`, () => {
		quickview.close();
	});
	
	/*
	Intercept "click" on <a> if it's on the .event-type area! 	
	*/
	document.addEventListener('click',( ev ) => {
		if( ev.target.matches('.event .event-type')){
			ev.preventDefault();
			ev.stopImmediatePropagation();
			// quick view JSON is held in <li> parent
			const li = bj.getParent( ev.target, 'li.event' );
			quickview.click( JSON.parse( li.dataset.quick ));
		}
	},{ capture:true });
	
	/*
	Notes on "Click": 
	Event sidebar is a list of <a> links, historically (and semantically)
	they were simply the way to navigate through the Events. Then Quicklook popup was
	added, as a desktop (hover) enhancement, and then QuickView was added.
	After these enhancements the DOM should be changed so that <a> doesn't wrap the 
	Quicklook and QuickView DOM and only wraps the link part. This would make it much easier
	on Touch devices, but this is unlikely to be done at the moment.
	*/
	
})( bluejay ); 
(function( bj ){

	'use strict';	
	
	bj.addModule('signatureCapture');
	
	/*
	Check for "capture signature" buttons 
	*/
	if( document.querySelector('.js-idg-capture-signature') === null ) return;
	

	const captureSignature = () => {		
	
		var wrapper = document.getElementById("signature-pad");
		var canvas = wrapper.querySelector("canvas");
		var clearBtn = document.getElementById('signature-pad-clear');
		var signaturePad = new SignaturePad(canvas, {
		  // It's Necessary to use an opaque color when saving image as JPEG;
		  // this option can be omitted if only saving as PNG or SVG
		  backgroundColor: 'rgb(255, 255, 255)'
		});
		
		// On mobile devices it might make more sense to listen to orientation change,
		// rather than window resize events.
		window.onresize = resizeCanvas;
		resizeCanvas();
		
		// Adjust canvas coordinate space taking into account pixel ratio,
		// to make it look crisp on mobile devices.
		// This also causes canvas to be cleared.
		function resizeCanvas() {
		  // When zoomed out to less than 100%, for some very strange reason,
		  // some browsers report devicePixelRatio as less than 1
		  // and only part of the canvas is cleared then.
		  var ratio =  Math.max(window.devicePixelRatio || 1, 1);
		
		  // This part causes the canvas to be cleared
		  canvas.width = canvas.offsetWidth * ratio;
		  canvas.height = canvas.offsetHeight * ratio;
		  canvas.getContext("2d").scale(ratio, ratio);
		
		  // This library does not listen for canvas changes, so after the canvas is automatically
		  // cleared by the browser, SignaturePad#isEmpty might still return false, even though the
		  // canvas looks empty, because the internal data of this library wasn't cleared. To make sure
		  // that the state of this library is consistent with visual state of the canvas, you
		  // have to clear it manually.
		  signaturePad.clear();
		}
		
		clearBtn.addEventListener("click", (function (event) {
		  signaturePad.clear();
		}));
		
	};
	
	const loadSignaturePad = () => {
		// xhr returns a Promise... 
		bj.xhr('/idg-php/v3/_load/signature-pad.php')
			.then( xreq => {
				const div = bj.div("oe-popup-wrap");
				div.innerHTML = xreq.html;
				
				// reflow DOM
				document.body.appendChild( div );
				
				// need this in case PHP errors and doesn't build the close btn DOM
				let closeBtn = div.querySelector('.close-icon-btn');
				if(closeBtn){
					closeBtn.addEventListener("mousedown", (ev) => {
						bj.remove(div);
					}, {once:true} );
				}
				
				// init Signature Pad
				captureSignature();
				
			})
			.catch( e => console.log('signature pad: failed to load', e ));  // maybe output this to UI at somepoint, but for now...
	};
	

	/*
	Load Signature Pad library when required
	https://github.com/szimek/signature_pad
	*/
	bj.loadJS('https://cdn.jsdelivr.net/npm/signature_pad@2.3.2/dist/signature_pad.min.js', true)
	    .then( () => {
		    // loaded, ok allow user to sign...
		    bj.userDown('.js-idg-capture-signature', loadSignaturePad );
	    });
	  

})( bluejay ); 
(function (uiApp) {

	'use strict';	
	
	uiApp.addModule('vcScratchPad');	
	
	const scratchPad = document.querySelector('#oe-vc-scratchpad');
	if(scratchPad === null) return;
	
	let offsetX, offsetY;
	let show = false;

	const handleStart = (e) => {
		e.dataTransfer.dropEffect = "move";
		let rect = e.target.getBoundingClientRect();
		offsetX = e.clientX - rect.left;
		offsetY = e.clientY - rect.top;
	};
	
	const handleEnd = (e) => {
		let top = Math.round(e.clientY - offsetY);
		let left = Math.round(e.clientX - offsetX);
		// stop it being dragged off screen
		top = top < 1 ? 1 : top;
		left = left < 1 ? 1 : left;
		scratchPad.style.top = top + "px";
		scratchPad.style.left = left + "px";
	};

	scratchPad.addEventListener("dragstart", handleStart, false);
	scratchPad.addEventListener("dragend", handleEnd, false);

	/*
	Demo the the scratchPad behaviour 
	*/
	const change = (ev) => {
		let btn = ev.target;
		if(show){
			uiApp.hide(scratchPad);
			btn.textContent = 'ScratchPad';
		} else {
			uiApp.show(scratchPad, 'block');
			btn.textContent = 'Hide ScratchPad';
		}
		show = !show;		
	};
	
	uiApp.userDown('#js-vc-scratchpad', change );


})(bluejay); 
/*
List Options Constructor
*/
(function (uiApp) {

	'use strict';	
	
	const addSelect = uiApp.namespace( 'addSelect' );	
	
	addSelect.ListOption = function (li, parent){
		
		let _selected = li.classList.contains('selected'); // check not setup to be selected:
		let _dependents = false;
		let json = JSON.parse(li.dataset.insert);
		
		
		/*
		Does list have any dependency lists?
		*/
		if( json.dependents !== undefined ){
			// build dependents
			_dependents = new addSelect.OptionDependents(json.dependents, parent.uniqueId);
		}
	
		/*
		Methods
		*/ 
		this.click = function(){
			this.toggleState();
			parent.optionClicked( _selected, this );
	
			if(_dependents != false){
				_dependents.show( _selected );
			}	
		};
		
		this.toggleState = function() {
			li.classList.toggle('selected'); 
			_selected = !_selected;
		};	
		
		this.deselect = function(){
			if( _selected ){
				this.toggleState();
			}
		};
		
		
		Object.defineProperty(this, 'selected',{
			get: () => {
				return _selected;
			},
			set: (v) => {
				_selected = v;
				if(!v){
					li.classList.remove('selected');
				}
			}
		});
		
		Object.defineProperty(this, 'dependents',{
			get: () => {
				return _dependents === false ? false : true; 
			}
		});
		
		Object.defineProperty(this, 'value',{
			get: () => {
				return json.value; 
			}
		});
		
	
	
		/*
		Events 
		*/
		li.addEventListener( "mousedown", this.click.bind( this ) );
	};
		
})(bluejay); 
/*
Optional Lists based on List selection
find group ID: 	"add-to-{uniqueID}-listgroup{n}";
find list ID: 	"add-to-{uniqueID}-list{n}";

@param dependents: String e.g. "2.1" or "2.1,2.2": 
*/

(function (uiApp) {

	'use strict';	
	
	const addSelect = uiApp.namespace( 'addSelect' );	
	
	addSelect.OptionDependents = function( dependents, listId ){

		if(dependents === undefined)  return false;
		
		/*
		List has extra list options	
		*/
		const idPrefix = "#add-to-" + listId + "-";
		let groups = [];
		
		/*
		Can be mulitple list groups.
		Check string for commas "2.1,2.2" for groups
		*/
		dependents.split(',').forEach( group => {
			
	
			let ids = group.split('.'); // could be mutliple list IDs e.g. 2.3.4.5
			let obj = {};
			// find group
			
			if(ids[0] === 0){
				console.log('Error: OptionDependents, listGroup = 0 !!',  idPrefix + 'listgroup'+ids[0]);
			}
			
			obj.div = document.querySelector(idPrefix + 'listgroup'+ids[0]); // <div> wrapper for optional lists
			if(obj.div === null){
				console.log('obj.div = null!',idPrefix + 'listgroup'+ids[0]);
			}
			
			obj.holder = obj.div.querySelector('.optional-placeholder'); // default placeholder for Optional Lists
			if(obj.holder === null){
				console.log('Adder: no placeholder text for optional group');
			}
			
	
			/*
			Does it have lists, or show default text?
			e.g. 2.0
			*/
			if( ids[1] == 0 ){
				obj.showDefaultText = true;
			} else {
				obj.showDefaultText = false;
				/*
				Not a ZERO... so:
				Loop through option lists required
				e.g. 2.4.5 (two lists in group '2')
				*/
				obj.lists = [];
				for(let i=1;i<ids.length;i++ ){
					let li = document.querySelector(idPrefix + 'list' + ids[i]);
					if(li === null){
						console.log('Err: OptionDependents, list? ', idPrefix + 'list' + ids[i]);	
					} else {
						obj.lists.push(li);
					}
					
				}
			}
			
			groups.push(obj);
		});
	
		/*
		Methods
		*/
		this.show = function( show ){
			if(show){
				/*
				hide ALL optional lists
				$('#add-to-'+listId+' .optional-list').hide();
				*/
				this.myLists();
			} else {
				// unclick
				this.reset();
			}
		};
	
		this.hideAllOptionalLists = function(div){
			let optionalLists = uiApp.nodeArray(div.querySelectorAll('.optional-list'));
			optionalLists.forEach((list) => {
				uiApp.hide(list);
			});
			
		};
	
		this.myLists = function(){
			groups.forEach( group => {
				/*
				in group hide other lists
				*/
				this.hideAllOptionalLists(group.div);
				
				if(group.showDefaultText){
					if(group.holder) uiApp.show(group.holder, 'block');
				} else {
					if(group.holder) uiApp.hide(group.holder);
					// show required Lists
					group.lists.forEach( list => {
						uiApp.show(list, 'block');
					});
				}
				
			});
		};
		
		/*
		Reset (these!) groups!	
		*/
		this.reset = function(){
			groups.forEach( group => {
				this.hideAllOptionalLists(group.div);
				if(group.holder) uiApp.show(group.holder, 'block');
			});
		};
			
	};
	
})(bluejay); 
(function (uiApp) {

	'use strict';	
	
	const addSelect = uiApp.namespace( 'addSelect' );
	
	addSelect.OptionsList = function(ul){
		
		let json = JSON.parse(ul.dataset.options);
		
		/*
		Types: Single & Multi are the main ones but 
		added in "inputTemplate" to handle the 
		list of options to fill the input field
		*/
		const template = json.type == 'inputTemplate' ? true : false;
		const single = json.type == 'single' ? true : false ;				
		// some assumptions here... 
		const hasOptions = json.hasExtraOptions === "true" ? true : false;
		const isOptionalList = json.isOptionalList === "true" ? true : false;
		
		this.uniqueId  = ul.dataset.id; // passes in DOM id (unique part) 
		
		/*
		Optional List? 
		Needs hiding. The List Option it depends on will show
		it when it's clicked	
		*/
		if(isOptionalList) {
			uiApp.hide(ul.parentNode);
		}
		 
		/*
		Store all List Options	
		*/
		let me = this; // hmmm... this could be better.
		let options = [];
		let defaultSelected = [];
		
		const listElems = uiApp.nodeArray(ul.querySelectorAll('li'));
		listElems.forEach((li) => {
			let liOpt = new addSelect.ListOption(li, this);
			options.push(liOpt);
			/*
			If liOpt is selected AND has dependents
			Need to activate the list AFTER all the other DOM
			is set up
			*/
			if( liOpt.selected && liOpt.dependents){
				/*
				Store and then loop through after
				others are all done to set up default
				selected states 
				*/
				defaultSelected.push(liOpt);
			}
		});
		
		/*
		Methods	
		*/
		this.optionClicked = function( selected, listOption ){
		
			if(template){
				// Assume that we have an input field available.
				let input = ul.previousElementSibling;
				let template = listOption.value;
				let selectStart = template.indexOf('{');
				let selectEnd = template.indexOf('}') + 1;
				input.value = template;
				listOption.deselect();
				// let the events play out
				setTimeout(() => {
					input.focus();
					input.select();
					input.setSelectionRange(selectStart, selectEnd);
				}, 50);
				return;
			}
			
			
			/*
			Manage this list. 
			Multi-select is the default	
			*/
			if(selected){
				if(single){
					options.forEach( option => {
						if(option !== listOption) option.deselect();
					});
				}
			} 
		};
		
		
		this.checkForDefaultSelections = () => {
			if( defaultSelected.length ){
				/*
				This all need 'clicking' to activate
				the dependent optional lists	
				*/
				defaultSelected.forEach( d => {
					/*
					To make the click work correctly 
					de-select the list btn, click will
					re-select it and activate the dependents 
					*/
					d.selected = false;
					d.click();
				});
			}
		};			
	};
		
})(bluejay); 

(function (uiApp) {

	'use strict';	
	
	const addSelect = uiApp.namespace( 'addSelect' );
	
	addSelect.Popup = function( greenBtn ){	
		
		let popup = document.querySelector('#' + greenBtn.dataset.popup);
		
		if( popup == null ) return;
		
		let lists = [];
		const reset = true;
		const require = false; 
	
		/*
		Using in analytics to build the data filters. Popup
		needs to anchor to the left. Can not rely to x < n to do this.
		*/
		this.anchorLeft = popup.dataset.anchorLeft ? true : false;
	
		/*
		Props
		*/ 
		this.btn = greenBtn;  
		this.popup = popup;
		this.closeBtn = popup.querySelector('.close-icon-btn');
	
		/*
		Methods
		*/
		this.open = function(){
			this.position();
			addSelect.closeAll();
			uiApp.show(popup, 'block');
			
			this.closeBtn.addEventListener('mousedown', this.close.bind(this));
			//window.addEventListener('scroll', this.close.bind(this), {capture:true, once:true});
		};
		
		this.close = function(){
			popup.style.display = "none";	
		};
		
		this.reset = function(){
			// reset (to default state)
		};
		
		let addOptions = uiApp.nodeArray(popup.querySelectorAll('.add-options'));
		addOptions.forEach((option) => {
			let list = new addSelect.OptionsList(option);
			list.checkForDefaultSelections();
			lists.push(list);
		});
		
		//idg.addSelectInsert.btnEvent( this, $popup.children('.close-icon-btn'), this.close );
		this.btn.addEventListener('mousedown', this.open.bind(this) );		
	};
	
	
	addSelect.Popup.prototype.position = function(){
		let rect = this.btn.getBoundingClientRect();	
		let w = window.innerWidth; // hmmm, this could be better as forces reflow
		let h = window.innerHeight;
		let posH = (h - rect.bottom);
		
		// check popup doesn't go off the top of the screen 
		// and don't overlay Logo! or Patient Name
		if(h - posH < 325){
			posH = h - 325;
		}
		
		/*
		Popup can be 'requested' to anchor left.
		Only used in Analytics (so far)	
		*/
		if( this.anchorLeft ){
			this.popup.style.left = rect.left + 'px';
		} else {
			// is popup pushing off the left
			let leftSideEdge = rect.right - this.popup.getBoundingClientRect().width;
			let adjustRight =  leftSideEdge < 0 ? leftSideEdge - 25 : 0;
			this.popup.style.right = (w - rect.right) + adjustRight + 'px' ;
		}
		
		this.popup.style.bottom = posH + 'px';

	};
	
		
})(bluejay); 

/*
Add Select Search insert Popup (v2)
Updated to Vanilla JS for IDG
*/

(function (uiApp) {

	'use strict';	
	
	uiApp.addModule('addSelect');
	const addSelect = uiApp.namespace( 'addSelect' );	
	
	/*
	keep a track of all popups	
	*/
	addSelect.all = [];
		
	/*
	Close all popups. Keep the interface tidy. 
	Actually there should be a popup controller... but for now:
	*/
	addSelect.closeAll = function(){
		this.all.forEach( popup  => {
			if( popup.close == undefined ) throw 'Every button defined with "js-add-select-btn" needs a popup DOM!';
			else popup.close();
		});
	};
		
	/*
	initialise	
	*/
	addSelect.init = function(){
			/*
			Find all the green + buttons
			*/
			const greenBtns = uiApp.nodeArray( document.querySelectorAll('.js-add-select-btn'));
			if(greenBtns.length < 1) return;
			
			greenBtns.forEach((btn) => {
				let newPopup = new addSelect.Popup( btn );
				this.all.push( newPopup );
			});
	};
	
	/*
	onLoad initialise
	*/
	document.addEventListener('DOMContentLoaded', () => addSelect.init(), {once:true});
	
		
})(bluejay); 

(function( bj ){

	'use strict';	
	
	/**
	* React Component 
	*/
	const buildComponent = () => {
				
		const rEl = React.createElement;
		const react = bj.namespace('react');

		class PathStepPopup extends React.Component {
			
			constructor( props ){
				super( props );
				
				// no need for state (at least, as I currently understand React JS ;)
				
				this.setTitle = this.setTitle.bind( this );
				this.content = this.content.bind( this );
				this.stepPIN = this.stepPIN.bind( this );
				this.stepActions = this.stepActions.bind( this );
				this.stepStatus = this.stepStatus.bind( this );
			}
			
			/**
			* Title, convert shortcode into full title
			* @params {*} this.props.step
			* @returns {ReactElement}
			*/
			setTitle( step ){
				const title = react.fullShortCode( step.shortcode );
				const time = ( step.status == 'next' ) ? "Next" : bj.clock24( new Date( step.timestamp ));
				return rEl('h3', null, `${time} - ${title}` ); 
			}
			
			/**
			* Demo some content example for popup
			*/
			content(){
				return (
					rEl('div', { 
							className: 'popup-overflow' 
						}, 
						rEl('div', { 
							className: 'data-group', 
							dangerouslySetInnerHTML: { 
								__html : '<table class="data-table"><tbody><tr><td><span class="oe-eye-lat-icons"><i class="oe-i laterality R small"></i><i class="oe-i laterality L small"></i></span></td><td>No step data being shown for this demo...</td><td>UX Demo</td></tr></tbody></table>'
							}, 	
						})
					)
				);
			}
			
			/**
			* Demo PIN inputs
			* @params {*} this.props.step
			* @returns {ReactElement}
			<div class="oe-user-pin pin-right-eye"><input class="user-pin-entry" type="text" maxlength="4" inputmode="numeric" placeholder="****"></div>
			*/
			stepPIN( step ){
				if( step.status == 'active' ){
					return (
						rEl('div', { className: 'step-pin cols-6 flex' }, 
							rEl('div', { className: 'oe-user-pin pin-right-eye' },  
								rEl('input', { 
									className: 'user-pin-entry', 
									type:'text', 
									maxlength: 4, 
									inputmode: 'numeric',
									placeholder: '****',
								})
							),
							rEl('div', { className: 'oe-user-pin pin-left-eye' },  
								rEl('input', { 
									className: 'user-pin-entry', 
									type:'text', 
									maxlength: 4, 
									inputmode: 'numeric',
									placeholder: '****',
								})
							)
						)	
					);
				}
			}
			
			
			/**
			* <button> actions for the popup, 
			* available actions depend on step status
			* @params {*} this.props.step
			* @returns {ReactElement}
			*/
			stepActions( step ){
				
				if( step.status != 'active' && step.status != 'next') return null; 
				
				const btn = ( css, btnTxt, newStatus ) => {
					return rEl( 'button', { 
						className: css,
						onClick: () => this.props.onChangeStepStatus( step.patientArrRef, step.arrRef, newStatus )
					}, btnTxt );
				};
				
				if( step.status == 'active' ){
					return (
						rEl('div', { className: 'step-actions' }, 
							btn('green hint', 'Complete', 'done' ),
							btn('red hint', 'Remove', 'remove' )
						)	
					);
				}
				
				if( step.status == 'next' ){
					return (
						rEl('div', { className: 'step-actions' }, 
							btn('blue hint', 'Make active', 'active' ),
							btn('red hint', 'Remove', 'remove' )
						)	
					);
				}
				
									
			}
			
			/**
			* show the steps status with CSS 
			* @params {*} this.props.step
			* @returns {ReactElement}
			*/
			stepStatus( step ){
				let css = 'step-status'; 
				if( step.status == 'done' ) css += ' green';
				if( step.status == 'active' ) css += ' orange';
				return rEl('div', { className: css }, step.status );
			}
			
			
			/**
			* Render
			*/
			render(){ 
				// Build and position the popup	
				const step = this.props.step; 
		
				if( step.shortcode == "~Fields"){
					return rEl( react.PopupFields, {
						step, 
						onActions: this.props.onClosePopup,
					});
				}
				
				if( step.shortcode == "~Img"){
					return rEl( react.PopupImage, {
						step, 
						onActions: this.props.onClosePopup,
					});
				}

				// set up a default standard step.
				return (
					rEl('div', {
							className: 'oe-pathstep-popup a-t-l',
							style: {
								top: step.rect.bottom,
								left: step.rect.left,
							}
						},
						rEl('div', { 
							className: 'close-icon-btn', 
							onClick: this.props.onClosePopup,
							dangerouslySetInnerHTML: { __html : '<i class="oe-i remove-circle medium"></i>'}
						}),
						
						this.setTitle( step ),
						this.content( step ),
						this.stepPIN( step ),
						this.stepActions( step ),
						this.stepStatus( step )
					)
				);
					
			}
		}
		
		// make component available	
		react.PathStepPopup = PathStepPopup;			
	};
	
	/*
	When React is available build the Component
	*/
	document.addEventListener('reactJSloaded', buildComponent, { once: true });
	  

})( bluejay ); 
(function( bj ){

	'use strict';	
	
	/**
	* React Component 
	*/
	const buildComponent = () => {
				
		const rEl = React.createElement;
		const react = bj.namespace('react');

		class PopupImage extends React.Component {
			
			constructor( props ){
				super( props );
				
				// no need for state (at least, as I currently understand React JS ;)
				
				this.setTitle = this.setTitle.bind( this );
				this.content = this.content.bind( this );
				this.stepActions = this.stepActions.bind( this );
				this.stepStatus = this.stepStatus.bind( this );
			}
			
			/**
			* Title, convert shortcode into full title
			* @params {*} this.props.step
			* @returns {ReactElement}
			*/
			setTitle( step ){
				const title = react.fullShortCode( step.shortcode );
				const time = ( step.status == 'next' ) ? "Configure" : bj.clock24( new Date( step.timestamp ));
				return rEl('h3', null, `Configure - Imaging` ); 
			}
			
			/**
			* Demo some content example for popup
			*/
			content(){
				return (
					rEl('div', { className: 'popup-overflow' }, 
						rEl('div', { className: 'data-group' }, 
							rEl('table', null, 
								rEl('tbody', null, 
									rEl('tr', null, 
										rEl('th', null, 'Eye:'),
										rEl('td', null, 
											rEl('fieldset', null, 
												rEl('label', { className: 'highlight inline'}, 
													rEl('input', { type: 'checkbox', name:'eye' }, null), 
													rEl('i', { className: 'oe-i laterality R medium' }, null)
												), 
												rEl('label', { className: 'highlight inline'}, 
													rEl('input', { type: 'checkbox', name:'eye' }, null), 
													rEl('i', { className: 'oe-i laterality L medium' }, null)
												)
											)
										)
									),
									rEl('tr', null, 
										rEl('th', null, 'OCT:'), 
										rEl('td', null, 
											rEl('fieldset', null, 
												rEl('label', { className: 'highlight inline'}, 
													rEl('input', { type: 'radio', name:'fieldtest' }, null), 
													rEl('span', null, 'Disc')
												), 
												rEl('label', { className: 'highlight inline'}, 
													rEl('input', { type: 'radio', name:'fieldtest' }, null), 
													rEl('span', null, 'Mac')
												), 
												rEl('label', { className: 'highlight inline'}, 
													rEl('input', { type: 'radio', name:'fieldtest' }, null), 
													rEl('span', null, 'Mac-Disc')
												)
											)
										)
									),
									rEl('tr', null, 
										rEl('th', null, 'Type:'), 
										rEl('td', null, 
											rEl('fieldset', null, 
												rEl('label', { className: 'highlight inline'}, 
													rEl('input', { type: 'radio', name:'type' }, null), 
													rEl('span', null, 'Zeiss')
												), 
												rEl('label', { className: 'highlight inline'}, 
													rEl('input', { type: 'radio', name:'type' }, null), 
													rEl('span', null, 'Topcon')
												), 
												rEl('label', { className: 'highlight inline'}, 
													rEl('input', { type: 'radio', name:'type' }, null), 
													rEl('span', null, 'Spectralis')
												)
											)
										)
									),
									rEl('tr', null, 
										rEl('th', null, 'KOWA-Disc:'), 
										rEl('td', null, 
											rEl('fieldset', null, 
												rEl('label', { className: 'highlight inline'}, 
													rEl('input', { type: 'checkbox', name:'kowa' }, null), 
													rEl('span', null, 'KOWA-Dis')
												)
											)
										)
									),
									rEl('tr', null, 
										rEl('th', null, 'Optos:'), 
										rEl('td', null, 
											rEl('fieldset', null, 
												rEl('label', { className: 'highlight inline'}, 
													rEl('input', { type: 'radio', name:'sta' }, null), 
													rEl('span', null, 'Daytona')
												), 
												rEl('label', { className: 'highlight inline'}, 
													rEl('input', { type: 'radio', name:'sta' }, null), 
													rEl('span', null, 'Silverstone')
												)
											)
										)
									)
								)
							)								
						)
					)
				);
			}
			
			//<label class="inline highlight"><input value="R" name="a-eye-sides" type="checkbox" checked=""> <i class="oe-i laterality R medium"></i></label>
			
			
			
			
			/**
			* <button> actions for the popup, 
			* available actions depend on step status
			* @params {*} this.props.step
			* @returns {ReactElement}
			*/
			stepActions( step ){
				
				if( step.status != 'active' && step.status != 'next') return null; 
				
				const btn = ( css, btnTxt, newStatus ) => {
					return rEl( 'button', { 
						className: css,
						onClick: this.props.onActions
					}, btnTxt );
				};
				
				if( step.status == 'active' ){
					return (
						rEl('div', { className: 'step-actions' }, 
							btn('green hint', 'Complete', 'done' ),
							btn('red hint', 'Remove', 'remove' )
						)	
					);
				}
				
				if( step.status == 'next' ){
					return (
						rEl('div', { className: 'step-actions' }, 
							btn('blue hint', 'Request Test', 'active' ),
							btn('red hint', 'Cancel Test', 'remove' )
						)	
					);
				}
				
									
			}
			
			/**
			* show the steps status with CSS 
			* @params {*} this.props.step
			* @returns {ReactElement}
			*/
			stepStatus( step ){
				let css = 'step-status'; 
				if( step.status == 'done' ) css += ' green';
				if( step.status == 'active' ) css += ' orange';
				return rEl('div', { className: css }, step.status );
			}
			
			
			/**
			* Render
			*/
			render(){ 
				// Build and position the popup	
				const step = this.props.step; 

				// set up a default standard step.
				return (
					rEl('div', {
							className: 'oe-pathstep-popup a-t-l',
							style: {
								top: step.rect.bottom,
								left: step.rect.left,
							}
						},
						rEl('div', { 
							className: 'close-icon-btn', 
							onClick: this.props.onActions,
							dangerouslySetInnerHTML: { __html : '<i class="oe-i remove-circle medium"></i>'}
						}),
						
						this.setTitle( step ),
						this.content( step ),
						this.stepActions( step ),
						this.stepStatus( step )
					)
				);
					
			}
		}
		
		// make component available	
		react.PopupImage = PopupImage;			
	};
	
	/*
	When React is available build the Component
	*/
	document.addEventListener('reactJSloaded', buildComponent, { once: true });
	  

})( bluejay ); 
(function( bj, clinic ){

	'use strict';	
	
	bj.addModule('clinicManager');
	
	/*
	Check we are on IDG Clinic Manager page... 
	*/
	if( document.getElementById('js-clinic-manager') === null ) return;
	
	/*
	Fake a small loading delay, gives the impression it's doing something important
	and demonstrates how to do the loader...
	*/
	const loading = bj.div('oe-popup-wrap', '<div class="spinner"></div><div class="spinner-message">Loading...</div>');
	document.body.append( loading );
	setTimeout(() => initClinicApp(), 500 );
	
	/**
	* Init the Clinic Manager SPA
	* Broadcast to all listeners that React is now available to use for building elements
	*/
	const initClinicApp = () => {
		bj.log('[Clinic Manager] - intialising');
		
		/*
		To make the IDG UX prototype easier to test an initial state JSON is provided by PHP.
		The demo times are set in RELATIVE minutes, which are updated to full timestamps
		*/
		const patientsJSON = JSON.parse( phpClinicDemoJSON );
		patientsJSON.forEach(( patient, i ) => {
			
			// Unique ID for each patient
			patient.uid = bj.getToken(); 
		
			/*
			As times are relative to 'now', make sure appointments 
			always appeared scheduled on whole 5 minutes: 
			*/
			const appointment = new Date( Date.now() + ( patient.booked * 60000 )); 
			const offsetFive = appointment.getMinutes() % 5; 
			appointment.setMinutes( appointment.getMinutes() - offsetFive );
			patient.booked = appointment.getTime();
			
			// convert to booked time to human time
			patient.time = bj.clock24( new Date( patient.booked ));
			
			/*
			Step Pathway is multi-dimensional array.
			Convert each step into an Object and add other useful info here. 
			*/		
			patient.pathway.forEach(( step, i, thisArr ) => {
				const obj = {
					shortcode: step[0],
					timestamp: Date.now() + ( step[1] * 60000 ),
					status: step[2],
					type: step[3],
				};
								
				// update the nested step array to an Object
				thisArr[i] = obj;
			});
		});
		
		/*
		Only <tr> in <tbody> need managing, may as well build the rest of the DOM immediately	
		*/
		const table = bj.dom('table', 'oe-clinic-list');
		table.innerHTML = Mustache.render([
			'<thead><tr>{{#th}}<th>{{.}}</th>{{/th}}</tr></thead>',
			'<tbody></tbody>'
		].join(''), {
			"th": ['Appt.', 'Hospital No.', 'Speciality', '', 'Name', '', 'Pathway', 'Assigned', 'Mins', '']
		});
		
		document.getElementById('js-clinic-manager').appendChild( table );
		
		/* 
		OK, ready to run this app, lets go!
		*/
		loading.remove();
		clinic.app( table.querySelector('tbody'), patientsJSON );
	};
	
})( bluejay, bluejay.namespace('clinic')); 

(function( bj, clinic, gui ){

	'use strict';	
	
	const app = ( tbody, json ) => {
		
		const patients = new Map();
		const filters = new Set();
		const adder = clinic.adder( json );
		let adderAllBtn;
	
		/** 
		* Model
		* Extended with views
		*/
		const model = Object.assign({
			_filter: "all", // "hideCompleted", "Unassigned", "MM", etc
			get filter(){
				return this._filter;
			},
			set filter( val ){
				this._filter = val; 
				this.views.notify();
			}
			
		}, bj.ModelViews());

		/**
		* VIEW: Filter Patients in Clinic
		*/
		const filterPatients = () => {
			const fragment = new DocumentFragment();
			patients.forEach( patient => {
				const tr = patient.render( model.filter );
				if( tr != null )fragment.appendChild( tr );
			});
			
			// update <tbody>
			bj.empty( tbody );
			tbody.append( fragment );
		};
		
		/**
		* VIEW: Update Filter Buttons
		* loop through patients and get all their assignments
		*/
		const updateFilters = () => {
			const assignments = [];
			patients.forEach( patient => assignments.push( patient.getAssigned()));
			filters.forEach( filter => filter.update( assignments, model.filter ));
		};
		
		model.views.add( filterPatients );
		model.views.add( updateFilters );

		/**
		* Adder: when an update options is pressed. Update all selected patients
		* @param {String} code - shortcode
		* @param {String} type - option type (assign, people, process)
		*/
		const updateSelectedPatients = ( code, type ) => {
			adder.getSelectedPatients().forEach( key => {
				const patient = patients.get( key );
				if( type == 'assign'){
					patient.setAssigned( code );
					updateFilters();
				} else {
					patient.addPathStep({
						shortcode: code,
						timestamp: false,
						status: 'todo',
						type,
					});
				}
			});
		};
		
		const hideAdder = () => {
			adderAllBtn.classList.replace('close', 'open');
			adder.hide();
		};
		
		/**
		* Event delegation
		*/
		
		// Button: "Arrived"
		bj.userClick('.js-idg-clinic-btn-arrived', ( ev ) => {
			const id = ev.target.dataset.patient;
			patients.get( id ).onArrived();
			adder.onPatientArrived( id );
		});
		
		// Button: "DNA"
		bj.userClick('.js-idg-clinic-btn-DNA', ( ev ) => {
			patients.get( ev.target.dataset.patient ).onDNA();
		});
		
		// Icon: "tick" (complete)
		bj.userDown('.js-idg-clinic-icon-complete', ( ev ) => {
			patients.get( ev.target.dataset.patient ).onComplete();
		});
		
		// Filter button (in header bar)
		bj.userDown('.js-idg-clinic-btn-filter', ( ev ) => {
			model.filter = ev.target.dataset.filter;
			hideAdder();
			gui.pathStepPopup.remove();
			
		});
		
		//  + icon specific for patient (<tr>)
		bj.userDown('.js-idg-clinic-icon-add', ( ev ) => {
			const id = ev.target.dataset.patient;
			adder.showSingle( 
				id, 
				patients.get( id ).getTime(),
				patients.get( id ).getLastname()
			);
		});
		
		//  + icon for ALL patients in header
		bj.userDown('.oe-clinic-filter button.add-to-all', ( ev ) => {
			if( adderAllBtn.classList.contains('open')){
				adderAllBtn.classList.replace('open', 'close');
				adder.showAll();
			} else {
				hideAdder();
			}
		});
		
		// Adder popup update action 
		bj.userDown('.oe-clinic-adder .update-actions li', ( ev ) => {
			updateSelectedPatients(
				ev.target.dataset.shortcode, 
				ev.target.dataset.type
			);
		});
		
		// Adder close btn
		bj.userDown('.oe-clinic-adder .close-btn', hideAdder );
		
		/**
		* Init Patients and set state from the JSON	
		* Add filters in the header bar
		*/
		(() => {
			// build patients (<tr>)
			json.forEach( patient => patients.set( patient.uid, clinic.patient( patient )));
			
			// add in filter buttons to the header
			const ul = document.getElementById('js-clinic-filter');
			[
				['Show all','all'],
				['Hide completed','completed'],
				['MM', 'MM'],
				['AB', 'AB'],
				['AG', 'AG'],
				['RB', 'RB'],
				['CW', 'CW'],
				['Not assigned', 'unassigned']
			].forEach( btn => {
				filters.add( clinic.filterBtn({
					name: btn[0],
					filter: btn[1],
				}, ul ));
			});
			
			// add in + all adder button to header
			const li = document.createElement('li');
			adderAllBtn = bj.dom('button', "add-to-all open");
			li.append( adderAllBtn );
			ul.append( li );

			// clinic always starts on "all"
			model.filter = "all";
		
			// the clock is running! 
			clinic.clock();
	
		})();
	};

	// add to namespace
	clinic.app = app;			

})( bluejay, bluejay.namespace('clinic'), bluejay.namespace('gui')); 
(function( bj, clinic ){

	'use strict';	
	
	/**
	* @param {JSON} json
	*/
	const adder = ( json ) => {
		
		const div = bj.div('oe-clinic-adder');
		const patients = bj.div('patients');
		const singlePatient = bj.div('single-patient'); 
		const arrived = new Map();
		const later = new Map();
		const selectedPatients = new Set(); 
		
		/**
		* GETTER: App
		*/
		const getSelectedPatients = () => selectedPatients;
		
		/**
		* <div> row with <h4> title 
		* @param {String} title
		* @returns {Element};
		*/
		const _row = ( title ) => {
			const row = bj.div('row');
			row.innerHTML = `<h4>${title}</h4>`;
			return row;
		};
		
		/**
		* <ul>
		* @param {String} class
		* @returns {Element};
		*/
		const _ul = ( css ) => {
			const ul = document.createElement('ul');
			ul.className = css;
			return ul;
		}; 

		/**
		* Patient list - update the DOM for Arrived and Later groups
		*/
		const updatePatientList = () => {
			
			const list = ( title, listMap ) => {
				const row = _row( title );
				const ul = _ul("row-list");
				listMap.forEach(( value, key ) => {
					const li = document.createElement('li');
					li.innerHTML = `<label class="highlight"><input type="checkbox" value="${key}" /><span>${value.time} - ${value.lastname}</span></label>`;
					ul.append( li );
				});
				row.append( ul );
				return row;
			}; 
			
			// update DOM
			patients.innerHTML = "";
			patients.append( list( "Arrived", arrived ));
			patients.append( list( "Later", later ));			
		};
		
		/**
		* Patient list - update who's selected
		*/
		const updateSelectPatients = () => {
			selectedPatients.clear();
			const inputs = bj.nodeArray( patients.querySelectorAll('input[type=checkbox]'));
			inputs.forEach( input => {
				if( input.checked ) selectedPatients.add( input.value );
			});
		};
		
		/**
		* Event delegation, just interested if a checkbox is changed
		*/
		patients.addEventListener('change', updateSelectPatients );
		
		/**
		* CSS Animation touch
		*/
		const fadein = () => {
			if( div.classList.contains('fadein')) div.classList.remove('fadein');
			div.classList.add('fadein');
		};
		
		/**
		* API patient arrived, need to update my lists
		* @param {String} id - patient key
		*/
		const onPatientArrived = ( id ) => {
			if( later.has( id )){
				arrived.set( id, later.get(id));
				later.delete( id );
			}	
			// update Arrived and Later patient groups
			updatePatientList();
		};

		/**
		* API: Show ALL patients
		*/
		const showAll = () => {
			bj.show( patients );
			bj.hide( singlePatient );
			updateSelectPatients(); // reset the selected list
			fadein();
		};
		
		/**
		* API: Show for specific patient
		* specific patient 
		*/
		const showSingle = ( id, time, surname ) => {
			bj.hide( patients );
			singlePatient.innerHTML = `${time} - ${surname}`;
			bj.show( singlePatient );
			selectedPatients.clear();
			selectedPatients.add( id );
			fadein();
		};
		
		/**
		* API: Hide adder
		*/
		const hide = () => div.classList.remove('fadein');
		
		/**
		* Init Adder and build staic DOM elements	
		*/
		(() => {
			// split patients into arrived and later groups
			json.forEach( patient => {
				if( patient.status == "active"){
					arrived.set( patient.uid, {
						time: patient.time, 
						lastname: patient.lastname
					});
				} 
				if( patient.status === 'todo' ){
					later.set( patient.uid, {
						time: patient.time, 
						lastname: patient.lastname
					});
				}
			});
			
			updatePatientList();
			
			/*
			Update actions are static, build once
			*/
			const updates = bj.div('update-actions');
			updates.append( singlePatient );
			
			const doctors = ['MM', 'AB', 'AG', 'RB', 'CW'].sort();
			const people = ['Nurse'];
			const process = ['Dilate', 'VisAcu', 'Orth', 'Ref', 'Img', 'Fields' ].sort();
			
			// helper
			const _li = ( code, type, html ) => {
				const li = document.createElement('li');
				li.setAttribute('data-shortcode', code );
				li.setAttribute('data-type', type);
				li.innerHTML = html;
				return li;
			};
			
			/*
			assignment options
			*/
			const nsPathStep = bj.namespace('pathstep'); 
			
			let row = _row('Assign to');
			let ul = _ul('btn-list');
			
			['unassigned'].concat( doctors ).forEach( code => {
				ul.append( _li( code, 'assign', nsPathStep.fullShortCode( code ))); 
			});
			
			row.append( ul );
			updates.append( row );
			
			/*
			people & processes pathsteps
			*/
			row = _row('Add to patient pathway');
			ul = _ul('btn-list');
			
			// people
			[].concat( doctors, people ).forEach( code => {
				const fullText = nsPathStep.fullShortCode( code );
				ul.append( _li( code, 'person', `${code} <small>- ${fullText}</small>`)); 
			});
			
			// processes 
			process.forEach( code => {
				const fullText = nsPathStep.fullShortCode( code );
				ul.append( _li( code, 'process', `${code} <small>- ${fullText}</small>`)); 
			});
			
			row.append( ul );
			updates.append( row );
			
			/*
			build structure & hide it
			*/
			div.append( bj.div('close-btn'), patients, updates );
			hide();
			
			// update DOM
			document.querySelector('.oe-clinic').append( div );
	
		})();
		
		/* 
		API
		*/
		return { showAll, showSingle, hide, onPatientArrived, getSelectedPatients };
		
	};
	
	clinic.adder = adder;
		


})( bluejay, bluejay.namespace('clinic') ); 
(function( bj, clinic ){

	'use strict';	
	
	/**
	* Clinic clock
	*/
	const showClock = () => {
		const div = bj.div('oe-clinic-clock');
		div.textContent = "";
		div.style.top = "100%";
		document.body.appendChild( div );
		
		const updateClock = () => {
			const tableRows = bj.nodeArray( document.querySelectorAll('table.oe-clinic-list tbody tr'));
			
			// there should always be a table, but in case not...
			if( ! tableRows.length ){
				div.style.top = "100%";
				return;
			}
			
			// table TRs have a timestamp on them
			const now = Date.now();
			
			// move offscreen if all TRs are in the "past". 
			let top = "100%"; 
			
			// find the next row booked time
			tableRows.every( tr  => {
				if( tr.dataset.timestamp > now ){
					top = ( tr.getBoundingClientRect().top - 9 ) + 'px';
					return false; // found it.
				} else {
					return true; // keep looking
				}
			});
			
			// update clock time and position
			div.style.top = top;
			div.textContent = bj.clock24( new Date( now ));
		};
		
		// check and update every half second
		setInterval( updateClock, 500 );
	};
	
	// make component available to Clinic SPA	
	clinic.clock = showClock;
	  

})( bluejay, bluejay.namespace('clinic')); 
(function( bj, clinic ){

	'use strict';	
	
	/**
	* Filter Btn <li>
	* @param {Object} props 
	* @param {parentNode} ul - <ul>
	* @return {Element} 
	*/
	const filterBtn = ( props, ul ) => {
		
		const filter = props.filter;
		const li = document.createElement('li');
		const count = bj.div('count');
		
		li.className = "filter-btn js-idg-clinic-btn-filter"; 
		li.setAttribute('data-filter', filter );
		
		
		// build btn and add to <ul> header
		(() => {
			const name = props.name;
			// check if it's short code
			const fullShortCode = bj.namespace('pathstep').fullShortCode( name );
			const fullName = fullShortCode == name ? false : fullShortCode;
			
			const div = bj.div('filter');
			let html = `<div class="name">${name}</div>`;
			if( fullName ) html += `<div class="fullname">${fullName}</div>`;
			div.innerHTML = html;
			
			// only show the count for patient assignments
			if( filter !== "all" && filter !== "completed"){
				div.appendChild( count );	
			}
			
			li.appendChild( div );
			
			// update DOM
			ul.appendChild( li );
			
		})();
		
		
		const update = ( allPatientAssignments, currentFilter ) => {
			// work out the counts per filter.
			const num = allPatientAssignments.reduce((acc, assigned ) => {
				if( assigned == filter ) return acc + 1; 
				return acc;
			}, 0 );
			
			count.textContent = num;
			
			if( currentFilter === filter ){
				li.classList.add('selected');	
			} else {
				li.classList.remove('selected');
			}
			
		};
		
		return { update };	
	};
	
	// make component available to Clinic SPA	
	clinic.filterBtn = filterBtn;			
  
})( bluejay, bluejay.namespace('clinic')); 
(function( bj, clinic, gui ){

	'use strict';	
	
	/**
	* Patient (<tr>)
	* @param {*} props
	* @returns {*} public methods
	*/
	const patient = ( props ) => {
		
		const tr = document.createElement('tr');
		const pathway =  bj.div('pathway');
		const assigned = document.createElement('td');
		const addIcon = document.createElement('td');
		const complete = document.createElement('td');
		
		/** 
		* Model
		* Extended with views
		*/
		const model = Object.assign({
			_uid: props.uid,
			_status: null, // "todo", "active", "complete"
			_assigned: false,
			
			get status(){
				return this._status;
			},
			set status( val ){
				this._status = val; 
				this.views.notify();
			},
			get assigned(){
				return this._assigned; 
			},	
			set assigned( val ){
				this._assigned = val;
				this.views.notify();	
			},
		}, bj.ModelViews());
		
		/**
		* GETTER / SETTER: App needs to get and set patient assigned from Adder
		*/
		const getAssigned = () => model.assigned;
		const setAssigned = ( val ) => model.assigned = val;
		
		const getTime = () => model.time;
		const getLastname = () => model.lastname;
		
		/*
		WaitDuration is based on the Arrival time and rendered based on 
		patient state, when patient arrives start the clock
		*/
		const waitDuration = clinic.waitDuration( props.uid );
		
		/**
		* VIEW: status of patient
		* if patient is "complete" hide the specific + icon
		*/
		const changeStatus = () => {
			tr.className = model.status;
			pathway.className = `pathway ${model.status}`;
			addIcon.innerHTML = model.status == "complete" ? 
				"" : 
				`<i class="oe-i plus-circle small-icon pad js-idg-clinic-icon-add" data-patient="${model._uid}"></i>`;
			
			waitDuration.render( model.status );
		};
		
		/**
		* VIEW: patient assignment
		*/
		const changeAssignment = () => {
			const fullText = bj.namespace('pathstep').fullShortCode( model.assigned );
			assigned.innerHTML = model.assigned == "unassigned" ?  
				`<small class="fade">${fullText}</small>` : 
				`<div>${fullText}</div>`;
		};
		
		/**
		* VIEW: complete (tick icon) / done
		*/
		const changeComplete = () => {
			complete.innerHTML = "";
			if( model.status == "complete"){
				complete.innerHTML = '<span class="fade">Done</span>';
			}
			if( model.status == "active"){
				complete.innerHTML = `<i class="oe-i save medium-icon pad js-has-tooltip js-idg-clinic-icon-complete" data-tt-type="basic" data-tooltip-content="Patient pathway finished" data-patient="${model._uid}"></i>`;
			}
		};
		
		model.views.add( changeStatus );
		model.views.add( changeAssignment );
		model.views.add( changeComplete );
		
		/**
		* Add PathStep to patient pathway
		* @param {Object} step
		*/
		const addPathStep = ( step ) => {
			if( step.type == "arrive" ) waitDuration.arrived( step.timestamp, model.status );
			if( step.type == "finish" ) waitDuration.finished( step.timestamp );
			// build pathStep
			step.info = step.timestamp == false ? "clock" : bj.clock24( new Date ( step.timestamp ));
			gui.pathStep( step, pathway );
		};
		
		/**
		* 'on' Handlers for Event delegation
		*/
		const onArrived = () => {
			addPathStep({
				shortcode: 'Arr',
				timestamp: Date.now(),
				status: 'done',
				type: 'arrive',
			});
			model.status = "active";
		};
		
		const onDNA = () => {
			addPathStep({
				shortcode: 'DNA',
				timestamp: Date.now(),
				status: 'done',
				type: 'DNA',
			});
			model.status = "complete";
		};
		
		const onComplete = () => {
			addPathStep({
				shortcode: 'Fin',
				timestamp: Date.now(), 
				status: 'done',
				type: 'finish',
			});
			model.status = "complete";
		};
		
		/**
		* Render Patient <tr>
		* @params {String} filter - filter buttons set this
		* @returns {Element} (if covered by filter option)	
		*/
		const render = ( filter ) => {
			// completed?
			if(	filter == "completed" && 
				model.status == 'complete' ) return null;
			
			// assigned?
			if( filter !== "all" &&
				filter !== "completed" ){
				if( model.assigned !== filter) return null;
			}
			// ok! 	
			return tr;
		};
		
		/**
		* Initiate inital patient state from JSON	
		* and build the <tr> DOM
		*/
		(() => {
			// patient state 
			model.status = props.status; 
			model.assigned = props.assigned;
			model.time = props.time;
			model.lastname = props.lastname;
			
			// build pathway steps
			props.pathway.forEach( step => addPathStep( step ));
			
			// build <tr>
			tr.setAttribute( 'data-timestamp', props.booked );
			tr.innerHTML = Mustache.render([
				'<td>{{time}}</td>',
				'<td>{{num}}</td>',
				'<td><div class="speciality">{{speciality}}</div><small class="type">{{specialityState}}</small></td>'
			].join(''), props );
			
			// slightly more complex Elements, but static content
			
			tr.append( clinic.patientQuickView( props ));
			tr.append( clinic.patientMeta( props ));
			tr.append( addIcon );
			
			const td = document.createElement('td');
			td.append( pathway );
			tr.append( td );	
				
			tr.append( assigned );
			tr.append( waitDuration.render( props.status ));
			tr.append( complete );
		})();
			
		/* 
		API
		*/
		return { onArrived, onDNA, onComplete, render, getAssigned, setAssigned, getTime, getLastname, addPathStep };
	};
	
	// make component available to Clinic SPA	
	clinic.patient = patient;
	

})( bluejay, bluejay.namespace('clinic'), bluejay.namespace('gui')); 
(function( bj, clinic ){

	'use strict';	

	/**
	* Patient Meta DOM
	* @param {Object} props 
	* @return {DocumentFragment} 
	*/
	const patientMeta = ( props ) => {
		/*
		DOM
		div.oe-patient-meta -|- div.patient-name -|- a -|- span.patient-surname
		                     |                          |- span.patient-firstname	
		                     |
		                     |- div.patient-details -|- div.nhs-number
		                                             |- div.patient-gender
		                                             |- div.patient-age 
		*/
		const template = [
			'<div class="oe-patient-meta">',
				'<div class="patient-name">',
					'<span class="patient-surname">{{lastname}}</span>, ',
					'<span class="patient-firstname">{{firstname}}</span>',
				'</div>',
				'<div class="patient-details">',
					'<div class="nhs-number"><span>NHS</span>{{nhs}}</div>',
					'<div class="patient-gender"><span>Gen</span>{{gender}}</div>',
					'<div class="patient-age"><span>Age</span>{{age}}</div>',
				'</div>',
			'</div>'
		].join('');
		
		const td = document.createElement('td');
		td.innerHTML = Mustache.render( template, props );
		
		return td;
	};
	
	// make component available to Clinic SPA	
	clinic.patientMeta = patientMeta;			
  

})( bluejay, bluejay.namespace('clinic')); 
(function( bj, clinic ){

	'use strict';	
	
	/**
	* Patient Meta DOM
	* @param {Object} props 
	* @return {Element} 
	*/
	const patientQuickView = ( props ) => {
		
		const i = document.createElement('i');
		i.className = "oe-i eye-circle medium pad js-patient-quick-overview";
		i.setAttribute('data-mode', 'side');
		i.setAttribute('data-php', 'patient/quick/overview.php');
		i.setAttribute('data-patient', JSON.stringify({
			surname: props.lastname,
			first: props.firstname,
			id: false, 
			nhs: props.nhs, 
			gender: props.gender, 
			age: props.age,
		}));
		
		const td = document.createElement('td');
		td.appendChild( i );
		
		return td;
	};
	
	// make component available to Clinic SPA	
	clinic.patientQuickView = patientQuickView;		

})( bluejay, bluejay.namespace('clinic')); 
(function( bj, clinic ){

	'use strict';	
	
	/**
	* waitDuration
	* @param {String} patientID - Patient uid
	* @returns {*} API;	
	*/
	const waitDuration = ( patientID ) => {
		const td = document.createElement('td');
		let timestamp = null;
		let mins = 0;
		let timerID = null;				
	
		/**
		* Calculate wait minutes from arrival time
		* @returns {Number} minutes
		*/
		const calcWaitMins = ( finishTime = false ) => {
			const endTime = finishTime == false ? Date.now() : finishTime;
			mins = Math.floor(( endTime - timestamp ) / 60000 );
		};
		
		/**
		* Callback from patient when the "Arr" step is added to the pathway
		* @param {Number} arriveTime - timestamp
		* @param {String} patientStatus - only looking for "active"
		*/
		const arrived = ( arriveTime, patientStatus ) => {	
			if( timestamp !== null ) return;
			timestamp = arriveTime;
			calcWaitMins();
			timerID = setInterval(() => {
				calcWaitMins();
				render("active");
			}, 15000 ); 				
		};
		
		/**
		* Callback from patient when the "Fin" step is added to the pathway
		* @param {Number} finishedTime - timestamp
		*/
		const finished = ( finishTime ) => {
			clearInterval( timerID );
			calcWaitMins( finishTime );
		};
					
		/**
		* SVG Circles to represent time waiting
		* @param {String} color (based on wait mins)
		* @returns {React Element}
		*/
		const svgCircles = () => {
			let color = 'green';			
			if( mins > 14 ) color = 'yellow';
			if( mins > 29 ) color = 'orange';
			if( mins > 59 ) color = 'red';
			
			const r = 6;
			const d = r * 2;
			const w = d * 4;
			
			const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
			svg.setAttribute('class', `duration-graphic ${color}`);
			svg.setAttribute('viewBox', `0 0 ${w} ${d}`);
			svg.setAttribute('height', d );
			svg.setAttribute('width', w );

			for( let i=0; i<4; i++ ){
				const cx = ((i + 1) * (r * 2)) - r;
				const circle = document.createElementNS("http://www.w3.org/2000/svg", 'circle');
				circle.setAttribute('class',`c${i}`);
				circle.setAttribute('cx',`${cx}`);
				circle.setAttribute('cy',`${r}`);
				circle.setAttribute('r',`${r}`);
				svg.appendChild( circle );
			}
			
			return svg;
		};	

		/**
		* Render Mins DOM
		* @returns {Element}
		*/
		const waitMins = () => {
			const div = bj.div('mins');
			const suffix = mins > 1 ? 'mins' : 'min';
			div.innerHTML = `<span>${mins}</span><small>${suffix}</small>`;
			return div;
		};
		
		/**
		* Render depends on status
		* @param {String} status - could be: "complete", "active", "todo"
		* @returns {Element} - appropriate element based on status
		*/
		const render = ( status ) => {
			const div = bj.div();
			
			if( status  == 'complete' ){
				div.className = 'wait-duration';
				div.appendChild( waitMins());
			}
			
			if( status == "active"){
				div.className = 'wait-duration';
				div.appendChild( svgCircles());
				div.appendChild( waitMins());
			}
			
			if( status == "todo" ){
				div.className = 'flex';
				div.innerHTML = [
					`<button class="cols-7 blue hint js-idg-clinic-btn-arrived" data-patient="${patientID}">Arrived</button>`,
					`<button class="cols-4 js-idg-clinic-btn-DNA" data-patient="${patientID}">DNA</button>`
				].join('');
			}
			
			td.innerHTML = "";
			td.appendChild( div );
			return td;
		};
		
		// API
		return { arrived, finished, render };
	};
	
	// make component available	
	clinic.waitDuration = waitDuration;	
	

})( bluejay, bluejay.namespace('clinic') ); 
(function( bj ){

	'use strict';	
	
	/*
	Centeralise, in the "pathstep" namespace, a method to get the 
	full text for shortcodes...	
	*/
	bj.namespace('pathstep').fullShortCode = ( shortcode ) => {
		
		let full = shortcode; // e.g "Nurse" doesn't need expanding on
	
		switch( shortcode ){
			case 'Arr': full = "Arrived"; break;
			case 'Fin': full = "Finish"; break;
			case "DNA" : full = "Did Not Attend"; break;
			case "unassigned" : full = "Not assigned"; break;

			case "MM" : full = "Mr Michael Morgan"; break;
			case "AB" : full = "Dr Amit Baum"; break;
			case "AG" : full = "Dr Angela Glasby"; break;
			case "RB" : full = "Dr Robin Baum"; break;
			case "CW" : full = "Dr Coral Woodhouse"; break; 
			
			case "Img" : full = "Imaging"; break;
			case "VisAcu" : full = "Visual Acuity"; break;
			case "Orth" : full = "Orthoptics"; break;
			case "Fields" : full = "Visual Fields"; break;
			case "Ref" : full = "Refraction"; break;
			
			case "PSD" : full = "Patient Specific Directive"; break;
			case "PGD" : full = "Patient Group Directive"; break;
			
			// icon instead of text
			case "PSD-A-overview":
			case "PSD-A" : full = "Haider Special Mix Set"; break;
			case "PSD-B-overview":
			case "PSD-B" : full = "Pre Op drops"; break;
			case "PSD-C-overview":
			case "PSD-C" : full = "HCA Nightingale (Custom)"; break;
			case "PSD-D" : full = "David Haider (Custom)"; break;
		}
		
		return full; 
	}; 
		
})( bluejay ); 
(function( bj, gui ){

	'use strict';	
	
	bj.addModule('gui.pathStep');	
	
	/**
	* Manage all pathSteps
	* Note, for this to work PathSteps must be added through JS (not PHP)
	*/
	const pathSteps = () => {
		
		const selector = 'oe-pathstep-btn';
		const collection = new bj.Collection();
		
		/*
		Methods	
		*/
		const _events= () => ({
			userDown(){
				gui.pathStepPopup.full( this, false );
			}, 
			userOver(){
				gui.pathStepPopup.quick( this );
			}, 
			userOut(){
				gui.pathStepPopup.hide();
			}
		});
		
		const _render = () => ({
			/**
			* Update the DOM CSS
			*/
			render(){
				const css = [ selector ];
				css.push( this.status );
				css.push( this.type );
				this.span.className = css.join(' ');
				this.updateInfo();
			}
		});
		
		const _setters = () => ({
			/**
			* @param {String} type - e.g. arrive, finish, process, person, config
			*/
			setType( type ){
				this.type = type;
				this.render();
			},
			/**
			* @param {String} status - next is default
			*/
			setStatus( status ){
				this.status = status;
				this.render();
			}, 
			/**
			* pathStepPopup move pathStep on to next state
			* @param {String} status - next is default
			*/
			nextState(){
				let newStatus;
				switch( this.status ){
					case 'config': newStatus = 'todo'; break;
					case 'todo': newStatus = 'active'; break;
					case 'active': newStatus = 'done'; break;
				}
				this.setStatus( newStatus );
				gui.pathStepPopup.full( this, true );
			}, 
			/**
			* IDG specific hack to provide a specific code for demo popups
			* @param {String} code
			*/
			setIdgPopupCode( idgCode ){
				this.idgCode = idgCode;
			}
			
		});
		
		
		const _setInfo = () => ({
			/** 
			* @params {String} - custom string or "clock" or false,
			* If it's false don't added it to the DOM as it increase height
			* "clock" - show a clock for each state change
			*/
			setInfo( info ){
				this.info = info;
				
				if( this.info ){
					const el = bj.dom('span','info');
					this.span.append( el );
					this.iSpan = el;
					this.render();
				} 
			}, 
			
			updateInfo(){
				if( !this.info  ) return; 
				
				this.iSpan.textContent = this.info === "clock" ? 
					bj.clock24( new Date( Date.now())):
					this.info;
				
				if( this.status == 'todo' || this.status == 'config' ){
					this.iSpan.classList.add('invisible'); // need the DOM to keep the step height consistent
				} else {
					this.iSpan.classList.remove('invisible');
				}
			}
		});
		
		const _remove = () => ({
			remove(){
				this.span.remove();
				collection.delete( this.key );
			}
		});
		
		/**
		* @Class
		* @param {Object} me - initialise
		* @returns {*} new PathStep
		*/
		const createPathStep = ( newPS ) => {
			return Object.assign( 
				newPS, 
				{ type:null },
				{ setKey( k ){ this.key = k; }},
				_render(),
				_setters(),
				_setInfo(), 
				_events(), 
				_remove()
			);
		};
		
		const getPathStep = ( target ) => {
			const key = collection.getKey( target );
			return collection.get( key );
		};
		
		/*
		Event delegation for PathSteps
		*/
		bj.userLeave(`.${selector}`, ev => getPathStep( ev.target ).userOut());
		bj.userEnter(`.${selector}`,  ev => getPathStep( ev.target ).userOver());
		bj.userDown(`.${selector}`, ev => getPathStep( ev.target ).userDown());

		/**
		* API - add new PathStep to DOM
		* @param {Object} step properties
		* @param {DOM parentNode} pathway 
		*/
		const addPathStep = ({ shortcode, status, type, info, idgPopupCode }, pathway ) => {
			
			// new DOM element
			/*
			Check for specials, e.g. Drug Admin
			*/
			const name = shortcode.startsWith('i-') ? 
				`<span class="step ${shortcode}"></span>` :
				`<span class="step">${shortcode}</span>`;
			
			const span = bj.dom('span', selector, name);
						
			// create new PathStep & set up
			const ps = createPathStep({ shortcode, span });
			ps.setStatus( status );
			ps.setType( type );
			
			if( idgPopupCode ) ps.setIdgPopupCode( idgPopupCode );
			
			/*
			Adding info to a pathstep will increase the button height.
			For PSDs and for pathSteps in Orders elements the info isn't needed and is "false"
			It can be a custom String, but mostly it's shows the time ("clock")
			*/
			ps.setInfo( info );
			
			// update collection 	
			ps.setKey( collection.add( ps, span ));
		
			// update DOM
			if( shortcode === "Arr") {
				pathway.prepend( span ); // put Arrived at the start of pathway
			} else {
				pathway.append( span );
			}
		};
		
		// API
		return addPathStep; 
	};
	
	// universal GUI. Clinic Manager, Worklists (PSDs), Orders Exam Element
	gui.pathStep = pathSteps();
		
})( bluejay, bluejay.namespace('gui')); 
(function( bj, gui, clinic ){

	'use strict';	
	
	bj.addModule('gui.pathStep');	
	
	/**
	* PathStep Popup
	*/
	const pathStepPopup = () => {
		
		const popup = bj.div('oe-pathstep-popup');
		let removeTimerID = null; 
		let lockedOpen = false; 
		let pathStep = null;
		let pathStepKey = null; // see loadContent

		/**
		* close/expand icon (provide a user hint that it can be expanded )
		* @param {Boolean} full (view) 
		* @returns {Element}
		*/
		const closeBtn = ( full ) => {
			const div = bj.div('close-icon-btn');
			div.innerHTML = full ? 
				'<i class="oe-i remove-circle medium-icon"></i>' :
				'<i class="oe-i expand small-icon"></i>';
			return div;
		};
		
		/**
		* Title, updates the <h3> title, always present
		* @param {String} shortcode 
		* @returns {Element}
		*/
		const setTitle = ( shortcode ) => {
			const h3 = bj.dom('h3', 'title');
			h3.textContent = bj.namespace('pathstep').fullShortCode( shortcode );
			return h3; 
		};
		
		
		/**
		* Load content, loading this from the server
		* @params {String} shortcode - PathStep shortcode e.g. "Arr", etc
		* @params {String} status - 'todo', 'active', 'etc'...
		* @params {Boolean} full - full view (or the quickview)
		*/
		const loadContent = ( shortcode, status, full ) => {
			/*
			Async.
			Use the pathStepKey for the token check
			*/
			const phpCode = `${shortcode}.${status}`.toLowerCase();
			bj.xhr(`/idg-php/load/pathstep/_ps.php?full=${full}&code=${phpCode}`, pathStepKey )
				.then( xreq => {
					if( pathStepKey != xreq.token ) return;
					popup.insertAdjacentHTML('beforeend', xreq.html );
				})
				.catch( e => console.log('PHP failed to load', e ));
		};
			
		/**
		* Render
		* @params {String} shortcode - PathStep shortcode e.g. "Arr", etc
		* @params {String} status - 'active', 'todo', 'done'
		* @params {String} type - 'process', 'person'
		* @params {Element} span - DOM Element for PathStep
		* @params {String} idgCode - short code for specific idgContent
		* @params {Boolean} full - full view (or the quickview)
 		*/
		const render = ({ shortcode, status, type, span, idgCode }, full ) => {
			clearTimeout( removeTimerID );
			
			const useCode = idgCode ? idgCode : shortcode;
			
			// clear all children and reset the CSS
			bj.empty( popup );
			popup.classList.remove('arrow-t', 'arrow-b');
			
			// build node tree:
			popup.append( closeBtn( full ));
			popup.append( setTitle( useCode ));
			
			loadContent(useCode , status, full );
			
			/*
			Position popup to PathStep (span)
			Anchor popup to the right side of the step
			Work out vertical orientation, if below half way down, flip it.
			*/
			const winH = bj.getWinH();
			const cssWidth = 380; // match CSS width
			const rect = span.getBoundingClientRect();
			const slightGap = 2; // so it doesn't get too tight
			
			popup.style.left = ( rect.right - cssWidth ) + 'px'; 
			
			if( rect.bottom < (winH * 0.7)){
				popup.style.top = rect.bottom + slightGap + 'px';
				popup.style.bottom = 'auto';
				popup.classList.add('arrow-t');
			} else {
				popup.style.top = 'auto';
				popup.style.bottom = ( winH - rect.top ) + slightGap + 'px';
				popup.classList.add('arrow-b');
			}
			
			// update DOM
			document.body.append( popup );
		};
		
		/**
		* Remove and reset 
		* this is also called by Clinic if a filter change happens
		*/
		const removeReset = () => {
			pathStep = null;
			lockedOpen = false;
			// There is a flicker if you 'scrub' along a pathway, delay removal to stop this
			removeTimerID = setTimeout(() => popup.remove(), 50 );
		};

		/**
		* User Clicks (click on same step to close)
		* @params {PathStep} ps 
		* @params {Boolean} userChangedStatus:
		* Use clicks on a button, in this popup, pathstep needs to update state and re-render!
		*/
		const full = ( ps, userChangedStatus = false ) => {
			if( ps === pathStep && userChangedStatus == false ){
				removeReset();
			} else {
				pathStep = ps;
				pathStepKey = ps.key; 
				lockedOpen = true;
				render( ps, true );
			}
		};
		
		/**
		* User Over - Quickview
		* @params {PathStep} ps
		*/
		const quick = ( ps ) => {
			if( lockedOpen ) return; 
			pathStepKey = ps.key; 
			render( ps, false );
		};
		
		/**
		* User Out
		* @params {PathStep} - deconstruct Object
		*/
		const hide = () => {
			if( lockedOpen ) return; 
			removeReset();
		};
		
		/*
		Event delegation
		*/
		// close icon btn in popup
		bj.userDown('.oe-pathstep-popup .close-icon-btn .oe-i', removeReset );
		
		// btn actions within popup. these are generic on IDG for demos
		bj.userDown('.oe-pathstep-popup .js-idg-ps-popup-btn', ( ev ) => {
			const userRequest = ev.target.dataset.action;
			if( userRequest == 'remove'){
				pathStep.remove();
				removeReset();
			}
			if( userRequest == 'next'){
				pathStep.nextState();
			}
		});
	    
	    // API 
	    return { full, quick, hide, remove:removeReset };
	};
	
	// singleton. Clinic Manager, Worklists (PSDs), Orders Exam Element
	gui.pathStepPopup = pathStepPopup();
		
})( bluejay, bluejay.namespace('gui'), bluejay.namespace('clinic')); 
(function( bj, queue ){

	'use strict';	
	
	bj.addModule('queueManager');
	
	/*
	Check we are on right page... 
	*/
	if( document.getElementById('js-queue-mgmt-app') === null ) return;
	
	/*
	Fake a small loading delay, gives the impression it's doing something important
	and demonstrates how to do the loader...
	*/
	const loading = bj.div('oe-popup-wrap', '<div class="spinner"></div><div class="spinner-message">Loading...</div>');
	document.body.append( loading );
	setTimeout(() => initApp(), 500 );
	
	/**
	* Init the Queue Manager SPA
	*/
	const initApp = () => {
		bj.log('[Queue Manager] - intialising');
		/* 
		OK, ready to run this app, lets go!
		*/
		queue.app( JSON.parse( idgQueueDemoJSON ));
		loading.remove();
	};
	
})( bluejay, bluejay.namespace('queue')); 

(function( bj, queue ){

	'use strict';	

	const Qs = new Map();
	const Ps = new Map();
	
	/**
	* Patient 
	* Abstract holds reference to DOM Element (only need to build <div> once)
	* @param {Object} p - Data from JSON to build patient 'card'
	* @returns {Object} 
	*/
	const initPatient = ( p ) => {
		const id = bj.getToken(); // key for set
		const div = bj.div('patient');
		div.id = id; 
		div.setAttribute('draggable', true );
		
		let risk = p.risk ? 'urgent' : 'grey';
		
		
		div.innerHTML = `<i class="oe-i triangle-${risk} small pad-right selected"></i> ${p.lastname}, ${p.firstname}`;
		
		// API
		return {
			id, 
			div,
			queue: null, // patients queue
			queuePos: null, // if dropped on, I need to know list position
			queueChange( newQueue ){
				/*
				new queue? remove myself from old queue 	
				*/
				if( this.queue != newQueue ){
					if( this.queue ) this.queue.removePatient( this.queuePos );
					this.queue = newQueue;
				}
			}, 
			setQueuePos( n ){
				this.queuePos = n;
			}
		};
	};

	/**
	* Queue 
	* Abstract holds reference to DOM Element (only need to build <div> once)
	* @param {Object} - Destructured
	* @returns {Object} 
	*/
	const initQueue = ({ id, header, root }) => {
		
		const el = bj.div('queue');
		const patientList = bj.div('patient-list');
		el.id = id;
		el.innerHTML = id == 'q0' ? 
			`<header class="in-flow">${header}</header>`:
			`<header>${header}</header>`;
		el.append( patientList );
		
		// add a button in the sidebar to allow show/hide
		const btn = bj.div('side-queue-btn selected');
		btn.setAttribute('data-queue', id );
		btn.innerHTML = `${header}<div class="patients"></div>`;
		document.getElementById('idg-side-queue-clinicians').append( btn );
		
		
		// update DOM (sloppy, but should be OK for demo)
		root.append( el );
		
		// API
		return {
			id,
			div: el, 
			btn,
			capacity: 10,
			btnPatients: btn.querySelector('.patients'),
			patientList,
			list: [],
			/* 
			Every time there is change to the list
			let all the Patients know their new positions	
			*/
			updatePatients(){
				this.list.forEach(( p, index ) => p.setQueuePos( index ));
				const showIcons = this.list.length > 21 ? 21 : this.list.length;
				this.btnPatients.style.width = (showIcons * 11) + 'px';
				//this.btnCount.textContent = this.list.length ? `${percent}%`: 'No patients assigned';
			},
			
			/**
			* Update patient position in same queue	
			* have to do some Array juggling... 
			*/
			changePatientPos( patient, newPos ){
				this.list[ patient.queuePos ] = null; // need to find this later
				this.list.splice( newPos, 0, patient ); // move in list
				const oldPosIndex = this.list.findIndex( i => i === null );// find old index
				this.list.splice( oldPosIndex, 1 ); // remove it
				this.render();
			},
			
			/**
			* Add new patient and insert in position	
			* Let patient know it's new queue
			* @param {*} patient
			*/
			addPatientAndPos( patient, pos ){
				patient.queueChange( this );
				this.list.splice( pos, 0, patient ); // place in list
				this.render();
				
			},
			
			/**
			* Add new patient to end of the queue
			* Let patient know it's new queue
			* @param {*} patient
			*/
			addPatient( patient ){
				patient.queueChange( this );
				this.list.push( patient ); // add to the end of the list
				this.render();
			},
			
			/**
			* @callback from Patient, letting it's old list know it's moved on
			* @param {Number} indexPos
			*/
			removePatient( indexPos ){
				this.list.splice( indexPos, 1);
				this.render();
			},
			render(){
				// reflow Patient list
				const fragment = new DocumentFragment();
				this.list.forEach( p => fragment.append( p.div ));
				
				bj.empty( patientList );
				patientList.append( fragment );
				
				// update patients with their new position the queue
				this.updatePatients();
			}
		};
	};
	
	
	/**
	* Drag n Drop
	*/
	
	
	/**
	* Drag start - source element
	* @param {Event} e
	*/
	const handleStart = ( e ) => {
		e.target.classList.add('moving');
		e.dataTransfer.effectAllowed = 'move';
		/*
		Can only set Text in the data. Set the ID.
		(This allows for a list of elements)
		e.g.node can be moved: add-to-end.append( document.getElementByID( e.dataTransfer.getData("text/plain") ));
		*/
		e.dataTransfer.setData("text/plain", e.target.id );	
		
	};
	
	/**
	* Drag end - source element
	* @param {Event} e
	*/
	const handleEnd = ( e ) => {
		e.target.classList.remove('moving');
	};
	
	/**
	* Drag over - add-to-end element
	* @param {Event} e
	*/
	const handleOver = ( e ) => {
		e.preventDefault(); // required.
		e.dataTransfer.dropEffect = 'move';
		
		if( e.target.matches('.queue')){
			const list = bj.find('.patient-list', e.target );
			list.classList.add('add-to-end');
		}
		
		if( e.target.matches('.queue .patient-list .patient')){
			e.target.classList.add('add-above');
			e.target.classList.remove('over');
		}

		return false; // a good practice!
	};
	
	/**
	* Drag leave - add-to-end element
	* @param {Event} e
	*/
	const handleDragLeave = (e) => {
		if( e.target.matches('.queue')){
			const list = bj.find('.patient-list', e.target );
			list.classList.remove('add-to-end');
		}	
		
		if( e.target.matches('.queue .patient-list .patient')){
			e.target.classList.remove('add-above');
		}	
	}; 
	
	/**
	* Drag DROP - add-to-end element
	* @param {Event} e
	*/
	const handleDrop = ( e ) => {
		e.preventDefault(); // required.
		
		const dataID = e.dataTransfer.getData("text/plain");
		const p = Ps.get( dataID );
	
		if( e.target.matches('.queue')){
			const list = bj.find('.patient-list', e.target );
			list.classList.remove('add-to-end');
			
			// add to the end of a queue list
			const queue = Qs.get( e.target.id ); 
			queue.addPatient( p );
		}
		
		if( e.target.matches('.queue .patient-list .patient')){
			e.target.classList.remove('add-above');
			
			if( dataID == e.target.id ) return false; // dropping on self
			
			// dropping on a patient in a queue
			const dropP = Ps.get( e.target.id );
			const dropQ = dropP.queue;
			
			if( dropP.queue == p.queue ){
				// same queue, update patient card position
				dropQ.changePatientPos( p, dropP.queuePos );
				
			} else {
				// dropping in a new queue
				dropQ.addPatientAndPos( p, dropP.queuePos );
			}
			
		}

		return false;
	};
	

	/**
	* Init - SPA
	* @param {Array} json - patients from PHP
	*/
	const app = ( json ) => {
		const root = document.getElementById('js-queue-mgmt-app');
		
		/*
		For the purpose of the demo hard code queues
		*/
		const buildQueue = ( id, header ) => {
			Qs.set( id, initQueue({ id, header, root }));
		};
		
		buildQueue( 'q0', 'New referrals' );
		buildQueue( 'q1', 'Dr Amit Baum' );
		buildQueue( 'q2', 'Dr Angela Glasby' );
		buildQueue( 'q3', 'Dr Robin Baum' );
		
		
		/*
		Patient data is coming from the PHP JSON
		each patient has a qNum that relates to
		the queue key to start it in	
		*/
		json.forEach( p => {
			const newPatient = initPatient( p );
			Ps.set( newPatient.id, newPatient );
		
			const queue = Qs.get( 'q' + p.qNum );
			queue.addPatient( newPatient );
		});
		
		/*
		fake a patient referral in-flow	
		*/
		const fakeInFlow = () => {
			const surname = ['SMITH', 'JONES', 'TAYLOR', 'BROWN','WILLIAMS','JOHNSON','DAVIES'];
			const firstname = ['Jack (Mr)', 'David (Mr)', 'Sarah (Ms)', 'Lucy (Mrs)', 'Jane (Mrs)', 'Mark (Mr)', 'James (Mr)', 'Ian (Mr)'];
			//const randomRisk = Math.random() < 0.5;
			
			const newPatient = initPatient({
				lastname: surname[Math.floor(Math.random() * surname.length)],
				firstname:  firstname[Math.floor(Math.random() * firstname.length)],
				risk: Math.random() < 0.2, // 1 in 5 Urgent!
			});
			
			Ps.set( newPatient.id, newPatient );
			Qs.get('q0').addPatient( newPatient );
			
			const randomInterval = ((Math.floor(Math.random() * 3)) * 2000) + 4000;
			setTimeout( fakeInFlow, randomInterval );
		};
	
		setTimeout( fakeInFlow, 4000 );
		
		
		
		// Drag n Drop, listeners
		root.addEventListener('dragstart', handleStart, { useCapture: true });
		//root.addEventListener('dragenter', handleEnter, { useCapture: true });
		root.addEventListener('dragover', handleOver, { useCapture: true });
		root.addEventListener('dragleave', handleDragLeave, { useCapture: true });
		root.addEventListener('dragend', handleEnd, { useCapture: true });
		root.addEventListener('drop', handleDrop, { useCapture: true });
		
		// Can not do the hover effect with CSS. Need to use JS
		// and then clear the hover class with handleOver drag event
		bj.userEnter('.queue  .patient', ( e ) => e.target.classList.add('over'));
		bj.userLeave('.queue  .patient', ( e ) => e.target.classList.remove('over'));
		
		// side btns
		bj.userDown('.side-queue-btn', e => {
			const btn = e.target;
			const queue = Qs.get( e.target.dataset.queue );
			if( btn.classList.contains('selected')){
				btn.classList.remove('selected');
				bj.hide( queue.div );	
			} else {
				btn.classList.add('selected');
				bj.show( queue.div );	
			}
		});
		
	};
	
	// add to namespace
	queue.app = app;			

})( bluejay, bluejay.namespace('queue')); 
/**
* Last loaded
*/
(function( bj ) {

	'use strict';
	
	// no need for any more extensions
	Object.preventExtensions( bj );
	
	// ready
	bj.ready();

})( bluejay );