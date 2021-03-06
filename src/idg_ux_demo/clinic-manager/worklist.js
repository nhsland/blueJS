(function( bj, clinic ){

	'use strict';
	
	/**
	* build Group
	* @param {Element} group - parentNode;
	* @param {*} list
	* return {Element}
	*/
	const buildDOM = ( group, list ) => {
		const riskIcon = list.usesPriority ? 'circle' : 'triangle';
		
		/**
		Each Worklist requires a "group". The Group has a "header". 
		The header shows the name of the Worklist (+ date, this will be added automatically by OE)
		It also allows removing from the view (if not in single mode)
		*/
		const header = bj.dom('header', false, [
			 `<div class="favourite"><i class="oe-i starline medium pad js-has-tooltip" data-tt-type="basic" data-tooltip-content="Add to worklist favourites"></i></div>`,
			 `<h3>${ list.title }</h3>`
		].join('')); 

		const table = bj.dom('table', 'oec-patients');
		table.innerHTML = Mustache.render([
			'<thead><tr>{{#th}}<th>{{{.}}}</th>{{/th}}</tr></thead>',
			'<tbody></tbody>'
		].join(''), {
			"th": [ 
				'Time', 
				'Clinic', 
				'Patient', 
				'<!-- meta icon -->', 
				'Pathway',
				'<label class="patient-checkbox"><input class="js-check-patient" value="all" type="checkbox"><div class="checkbox-btn"></div></label>', 
				`<i class="oe-i ${riskIcon}-grey no-click small"></i>`,
				'<i class="oe-i comments no-click small"></i>',
				'Wait hours', 
				'<!-- complete icon -->'
			]
		});
		
		group.append( header, table );
	};
	
	
	/**
	* Initalise Worklist
	* @param {*} list 
	* list.title { String }
	* list.json {JSON} - all patient data
	* list.fiveMinBookings {Boolean}, 
	* @param {String} id - unique ID 'bj1'
	* @param {Fragment} fragment - inital DOM build	
	*/
	const init = ( list, id, fragment ) => {
		
		/**
		* Process the patient JSON
		* @returns {Map} - key: uid, value: new Patient
		*/
		const patients = clinic.patientJSON( list.json, list.usesPriority );
		
		// build the static DOM
		const group = bj.dom('section', 'oec-group');
		group.id = `idg-list-${id}`;
		group.setAttribute('data-id', id );
		
		buildDOM( group, list );
		fragment.append( group );
		
		// Only <tr> in the <tbody> need re-rendering
		const tbody = group.querySelector('tbody');
		
		// add list clock
		clinic.clock( tbody );
		
		/**
		* @Event
		* + icon in <thead>, select/deselect all patients
		* all this does is toggle all patient + icons
		*/
		group.addEventListener('change', ev => {
			const input = ev.target;
			if( input.matches('.js-check-patient') && 
				input.value == "all" ){
				patients.forEach( patient  => patient.setTicked( input.checked ));
			}
		},{ useCapture:true });
		
		
		/**
		* @Event - Patient actiions outside of pathway
		*/
		
		// for scheduled patients
		const patientArrived = ( patientID ) => {
			if( patients.has( patientID )){
				patients.get( patientID ).onArrived();
			}
		};
		
		// for scheduled patients
		const patientDNA = ( patientID ) => {
			if( patients.has( patientID )){
				patients.get( patientID ).onDNA();
			}
		};
		
		// manually finish the pathway
		const patientComplete = ( patientID ) => {
			if( patients.has( patientID )){
				patients.get( patientID ).onComplete();
			}
		};
			
		/**
		* Add steps to patients
		* Insert step option is pressed. Update selected patients
		* @param {Object} dataset from <li>
		*/
		const addStepsToPatients = ( json ) => {
			const { c:code, s:status, t:type, i:idg } = ( JSON.parse(json) );

			patients.forEach( patient => {
				if( patient.isTicked()){
					if( code == 'c-last'){
						patient.removePathStep( code ); // Remove last step button
					} else {
						patient.addPathStep({
							shortcode: code, // pass in code
							status,
							type, 
							timestamp: Date.now(),
							idgPopupCode: idg ? idg : false,
						});
					}	
				}
			});
		};
		
		/**
		* Untick all patients AND tick (+) in <thead>
		*/
		const untickPatients = () => {
			patients.forEach( patient => patient.setTicked( false ));
			// and deselect the <thead> + icon
			group.querySelector('thead .js-check-patient').checked = false;
		};
		
		/**
		* Loop through patients and get their status
		* Filter btns will figure out their count
		* @returns {*}
		*/
		const getPatientFilterState = () => {
			const status = [];
			const redflagged = [];
			patients.forEach( patient => {
				status.push( patient.getStatus());
				redflagged.push( patient.getRedFlagged());
			});
			
			return { status, redflagged };
		};
		
		/**
		* Render Patients in list based on Filter
		* @param {String} filter - the selected filter
		*/
		const render = ( filter ) => {
			// build new <tbody>
			const fragment = new DocumentFragment();
			
			// Patients decide if they match the filter
			// if so, show in the DOM and update the filterPatients set
			patients.forEach( patient => {
				const tr = patient.render( filter );
				if( tr != null ){
					fragment.append( tr );
				}
			});
			
			// update <tbody>
			bj.empty( tbody );
			tbody.append( fragment );
			
			// if there aren't any patient rows
			if( tbody.rows.length === 0 ){
				const tr = bj.dom('tr','no-results', `<td><!-- padding --></td><td colspan='9' style="padding:20px 0" class="fade">No patients found</div></td>`);
				tbody.append( tr );
			}
		};

		return {
			render,
			addStepsToPatients,
			getPatientFilterState,
			untickPatients,
			patientArrived,
			patientDNA,
			patientComplete
		};
	};

	// add to namespace
	clinic.addList = init;			

})( bluejay, bluejay.namespace('clinic')); 