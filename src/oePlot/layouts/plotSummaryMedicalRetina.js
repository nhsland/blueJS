(function( bj, oePlot ){

	'use strict';
	
	/**
	* OES Medical Retina R/L template
	* Sub-plot layout
	* |- Events: Injection, Images (OCT), Managment (Inj Mgmt & Clinical Mgmt)
	* |- CRT & VA (VA has multiple units)
	* |- Offscale: CF, HM, PL, NPL
	* |- [Navigator] 
	*
	* Domain allocation for layout: (note: 0 - 1, 0 is the bottom)
	* Using subploting within plot.ly - Navigator outside this
	*/
	const domainLayout = [
		[0.7, 1], 		// Events
		[0.15, 0.64],	// CRT & VA
		[0, 0.15],		// Offscale
	];
	
	// Plotly: hold all parameters for each plot (R & L)
	const myPlotly = new Map();	
	
	// save the JSON, need this for when the user switches themes 
	let oePlotJSON = null; 
	
	// tools
	let tools = null; 
	
	/**
	* Build data traces for Plotly
	* traces are stored in myPlotly Map.
	* @param {JSON} eyeJSON data
	* @param {String} eyeSide - 'leftEye' or 'rightEye'
	*/
	const buildDataTraces = ( eyeJSON, eyeSide  ) => {
		
		// VA offscale: CF, HM, PL, NPL
		const VA_offScale = {
			x: eyeJSON.VA.offScale.x,
			y: eyeJSON.VA.offScale.y,
			name: eyeJSON.VA.offScale.name,		
			hovertemplate: '%{y}<br>%{x}',
			type: 'scatter',
			mode: 'lines+markers',
		};
		
		const CRT = {
			x: eyeJSON.CRT.x,
			y: eyeJSON.CRT.y,
			name: eyeJSON.CRT.name,	
			yaxis: 'y2',	
			hovertemplate: 'CRT: %{y}<br>%{x}',
			type: 'scatter',
			mode: 'lines+markers',
			line: oePlot.dashedLine(),
		};
	
		/**
		VA data traces can be changed by the User, e.g. Snellen Metre, logMAR, etc
		the trace AND it's axis layout need to be stored together. This is what
		userSelectedUnits handles.
		*/
		for (const [ key, trace ] of Object.entries( eyeJSON.VA.units )){
			tools.selectableUnits.addTrace( eyeSide, key, {
				x: trace.x,
				y: trace.y,
				name: trace.name,	
				yaxis: 'y3',	
				hovertemplate: trace.name + ': %{y}<br>%{x}',
				type: 'scatter',
				mode: 'lines+markers',
			});
		}
		
		/**
		Store data traces in myPlotly
		*/
		myPlotly.set( eyeSide, new Map());
		myPlotly.get( eyeSide ).set('data', new Map());
		myPlotly.get( eyeSide ).get('data').set( VA_offScale.name, VA_offScale );
		myPlotly.get( eyeSide ).get('data').set( CRT.name, CRT );
		myPlotly.get( eyeSide ).get('data').set('VA', tools.selectableUnits.getTrace( eyeSide ));
		
		/**
		Event data are all individual traces
		all the Y values are are the SAME, so that are shown on a line
		extra data for the popup can be passed in with customdata
		*/
		Object.values( eyeJSON.events ).forEach(( event ) => {
			
			const newEvent = Object.assign({
					oeEventType: event.event, // store event type
					x: event.x, 
					y: event.y, 
					customdata: event.customdata,
					name: event.name, 
					yaxis: 'y4',
					hovertemplate: event.customdata ? '%{y}<br>%{customdata}<br>%{x}' : '%{y}<br>%{x}',
					type: 'scatter',
					showlegend: false,
				}, oePlot.eventStyle(  event.event ));
			
			myPlotly.get( eyeSide ).get('data').set( newEvent.name, newEvent);
		});
	};
	
	/**
	* React to user request to change VA scale 
	* (note: used as callback from 'tools')
	* @param {String} which eye side?
	*/
	const plotlyReacts = ( eyeSide ) => {
		
		// get the eyePlot for the eye side
		let eyePlot = myPlotly.get( eyeSide ); 
		
		// Check the user selected units for VA
		eyePlot.get('data').set('VA', tools.selectableUnits.getTrace( eyeSide ));
		eyePlot.get('layout').yaxis3 = tools.selectableUnits.getAxis();
		
		// Check for hoverMode setting
		eyePlot.get('layout').hovermode = tools.hoverMode.getMode();

		// Data Array of ALL traces
		const data = Array.from( eyePlot.get('data').values());
		
		/**
		* Plot.ly!
		* Build new (or rebuild) have to use react()
		*/
		Plotly.react(
			eyePlot.get('div'), 
			data, 
			eyePlot.get('layout'), 
			{ displayModeBar: false, responsive: true }
		);
	};
	
	/**
	* After init - build layout and initialise Plotly 
	* @param {Object} setup - deconstructed
	*/
	const plotlyInit = ({ title, eyeSide, colors, xaxis, yaxes, parentDOM }) => {
		/*
		Ensure parentDOM is empty (theme switch re-build issue otherwise!)
		*/
		const parent = document.querySelector( parentDOM );
		bj.empty( parent );
		
		// Need a wrapper to help with the CSS layout		
		const div = oePlot.buildDiv(`oes-${eyeSide}`);
		parent.append( div );
		
		/*
		Build layout
		*/
		const layout = oePlot.getLayout({
			darkTheme: oePlot.isDarkTheme(), // link to CSS theme
			legend: {
				yanchor:'bottom',
				y: domainLayout[1][1], // position relative to subplots
			},
			colors,
			plotTitle: title,
			xaxis,
			yaxes,
			subplot: domainLayout.length, // num of sub-plots 
			rangeSlider: true, 
			dateRangeButtons: true,
		});
	
		console.log( layout );
		
		// store details
		myPlotly.get( eyeSide ).set('div', div);
		myPlotly.get( eyeSide ).set('layout', layout);
		
		// build
		plotlyReacts( eyeSide );
		
		// set up click through
		//oePlot.addClickEvent( div, setup.eye );
		//oePlot.addHoverEvent( div, eyeSide );
		
		/* 
		bluejay custom event
		User changes layout arrangement (top split view, etc)
		*/
		document.addEventListener('oesLayoutChange', () => {
			Plotly.relayout( div, layout );
		});	
	}; 
	
	
	/**
	* init - called from the PHP page that needs it
	* @param {JSON} json - PHP supplies the data for charts
	*/
	const init = ( json  ) => {
		if( json === null ) throw new Error('[oePlot] Sorry, no JSON data!');
		bj.log(`[oePlot] - OES Medical Retina`);
		
		/**
		* Store JSON data
		* When a users changes themes EVERYTHING needs rebuilding
		* the only way (I think) to do this is to re-initialise
		*/
		oePlotJSON = oePlotJSON || json; 
		myPlotly.clear();
		
		/**
		* oePlot tools
		* Allows the user to access extra chart functionality
		* tools will add a fixed toolbar DOM to the page.
		*
		* Tools are not effected by a theme switch, CSS will 
		* re-style them, but the traces and axes need updating
		*/
		if( tools == null ){
			tools = oePlot.tools();
			tools.plot.setReacts( plotlyReacts, ['rightEye', 'leftEye']);
			tools.hoverMode.add(); // user hoverMode options for labels
			
			// VA has dynamic axis based, e.g. SnellenMetre, LogMAR, etc
			tools.selectableUnits.addAxes({
				axisDefaults: {
					type:'y',
					rightSide: 'y2', // CRT & VA plot 
					domain: domainLayout[1],
					spikes: true,
				}, 
				yaxes: json.yaxis.VA,
				prefix: 'VA',
			});
			
			// check for tabular data:
			if( json.tabularDataID ){
				tools.tabularData.add( json.tabularDataID );
			}
			
			tools.showToolbar(); // update DOM
		} else {
			// rebuilding...
			tools.selectableUnits.clearTraces();
			tools.selectableUnits.updateAxesColors();
		}
	
		/**
		* Traces - build data traces from JSON 
		*/
		
		if( json.rightEye ){
			buildDataTraces( json.rightEye, 'rightEye' );
		}
		
		if( json.leftEye ){
			buildDataTraces( json.leftEye, 'leftEye' );
		}
	
		/**
		* Axes 
		*/
		
		// set Y3 to the "makeDefault" unit. User can change this with the "tools"
		const y3 = tools.selectableUnits.getAxis();
		
		// x1 - Timeline
		const x1 = oePlot.getAxis({
			type:'x',
			numTicks: 10,
			useDates: true,
			spikes: true,
			noMirrorLines: true,
		}, oePlot.isDarkTheme());
		
		// y1 - offscale 
		const y1 = oePlot.getAxis({
			type:'y',
			domain: domainLayout[2], 
			useCategories: {
				categoryarray: json.yaxis.offScale,
				rangeFit: "padTop", // "exact", etc
			},
			spikes: true,
		}, oePlot.isDarkTheme());
		
		// y2 - CRT
		const y2 = oePlot.getAxis({
			type:'y',
			domain: domainLayout[1],
			title: 'CRT', 
			range: json.yaxis.CRT, 
			spikes: true,
		}, oePlot.isDarkTheme());
		
		// y4 - Events
		const y4 = oePlot.getAxis({
			type:'y',
			domain: domainLayout[0],
			useCategories: {
				categoryarray: json.allEvents,
				rangeFit: "pad", // "exact", etc
			},
			spikes: true,
		}, oePlot.isDarkTheme());
		
		/**
		* Layout & Initiate
		*/	
		if( myPlotly.has('rightEye') ){
			
			plotlyInit({
				title: "Right Eye",
				eyeSide: "rightEye",
				colors: "rightEyeSeries",
				xaxis: x1, 
				yaxes: [ y1, y2, y3, y4 ],
				parentDOM: '.oes-left-side',
			});	
		} 
		
		if( myPlotly.has('leftEye') ){
			
			plotlyInit({
				title: "Left Eye",
				eyeSide: "leftEye",
				colors: "leftEyeSeries",
				xaxis: x1, 
				yaxes: [ y1, y2, y3, y4 ],
				parentDOM: '.oes-right-side',
			});			
		}
	};
	
	/**
	* OE Theme change
	* Users changes the theme, re-initialise with the stored JSON
	*/
	document.addEventListener('oeThemeChange', () => {
		// give the browser time to adjust the CSS
		setTimeout( init( oePlotJSON ), 100 ); 
	});
	
	/**
	* Extend blueJS
	* PHP will call this directly with JSON when DOM is loaded
	*/
	bj.extend('plotSummaryMedicalRetina', init );	
	
		
})( bluejay, bluejay.namespace('oePlot')); 