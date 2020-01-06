/**
* Namespace controller within App for Modules
*/
(function () {

	'use strict';
	
	/**
	Manage all my Modules 
	*/
	const modules = {};
	
	/**
	 * Add a new module
	 * @param {String} name of module 
	 * @param {Object} public methods
	 * @returns {Boolean} 
	 */
	let add = (name, methods) => {
		// check for unique namespace
		if (!(name in modules)){
			
			bluejay.log('Module added: '+name);
			modules[name] = {};
			return modules[name];
	
		} else {
			
			bluejay.log('Err: Module aleady added? ' + name);
			return false;
		}
	};
	
	/**
	 * Get namespace
	 * @param  {String} namespace
	 * @return {Object} 
	 */
	let get = (name) => {
		
		if (!(name in modules)){
			bluejay.log('Module does not exist?: '+name);
			return;	
		}
		
		return modules[name];
	};
	
	// Extend App
	bluejay.extend('addModule',add);
	bluejay.extend('getModule',get);
	
})();