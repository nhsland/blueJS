(function ( bj ) {

	'use strict';
	
	const oesTemplateType = "Medical Retina";
	
	// oe CSS theme!
	const darkTheme = oePlotly.isDarkTheme();
	
	/**
	* Plotly parameters
	* Map top level parameters for each plot (R & L)
	*/
	const myPlotly = new Map();	
	
	/**
	* Helpers
	*/
	const dateRange = oePlotly.fullDateRange();
	const userSelecterUnits = oePlotly.selectableUnits();
	
	
	/**
	* Build data trace format for Glaucoma
	* @param {JSON} eyeJSON data
	* @param {String} eyeSide - 'leftEye' or 'rightEye'
	* @returns {Array} for Plol.ly data
	*/
	const buildDataTraces = ( eyeJSON, eyeSide  ) => {
		
		/**
		* store data traces with own keys
		* traces can then be accessed by their JSON name
		*/
		myPlotly.get( eyeSide ).set('data', new Map());
		
		const VA_offScale = {
			x: eyeJSON.VA.offScale.x,
			y: eyeJSON.VA.offScale.y,
			name: eyeJSON.VA.offScale.name,		
			hovertemplate: '%{y}<br>%{x}',
			type: 'scatter',
			mode: 'lines+markers',
		};
		
		myPlotly.get( eyeSide ).get('data').set( eyeJSON.VA.offScale.name, VA_offScale);
		dateRange.add( eyeJSON.VA.offScale.x );
		
		const CRT = {
			x: eyeJSON.CRT.x,
			y: eyeJSON.CRT.y,
			name: eyeJSON.CRT.name,	
			yaxis: 'y2',	
			hovertemplate: 'CRT: %{y}<br>%{x}',
			type: 'scatter',
			mode: 'lines+markers',
			line: oePlotly.dashedLine(),
		};
		
		myPlotly.get( eyeSide ).get('data').set( eyeJSON.CRT.name, CRT);
		dateRange.add( eyeJSON.CRT.x );
		
		/**
		* User selectable VA data traces
		*/
		Object.values( eyeJSON.VA.units ).forEach(( unit, index ) => {
			
			userSelecterUnits.addTrace( eyeSide, {
				x: unit.x,
				y: unit.y,
				name: unit.name,	
				yaxis: 'y3',	
				hovertemplate: unit.name + ': %{y}<br>%{x}',
				type: 'scatter',
				mode: 'lines+markers',
			});
			
			// only need to check one of these dates
			if( !index ) dateRange.add( unit.x );
		});
		
		myPlotly.get( eyeSide ).get('data').set( 'VA', userSelecterUnits.selectedTrace( eyeSide ));
		
		/**
		Build Events data for right eye
		*/
		// loop through array...
		Object.values( eyeJSON.events ).forEach(( event ) => {
			
			let template = event.customdata ? '%{y}<br>%{customdata}<br>%{x}' : '%{y}<br>%{x}';
			
			let newEvent = Object.assign({
					oeEventType: event.event, // store event type
					x: event.x, 
					y: event.y, 
					customdata: event.customdata,
					name: event.name, 
					yaxis: 'y4',
					hovertemplate: template,
					type: 'scatter',
					showlegend: false,
				}, oePlotly.eventStyle(  event.event ));
			
			myPlotly.get( eyeSide ).get('data').set( event.name, newEvent);
			dateRange.add( event.x );
		});
	};
	
	/**
	* React to user request to change VA scale 
	* (note: used as a callback by selectableUnits)
	* @param {String} which eye side?
	*/
	const plotlyReacts = ( eyeSide ) => {
		// get the eyePlot for the eye side
		let eyePlot = myPlotly.get( eyeSide );
		
		/*
		Update user selected units for VA
		*/
		eyePlot.get('data').set('VA', userSelecterUnits.selectedTrace( eyeSide ));
		eyePlot.get('layout').yaxis3 = Object.assign({}, userSelecterUnits.selectedAxis());
		
		// get Data Array of all traces
		const data = Array.from( eyePlot.get('data').values());

		// build new (or rebuild)
		Plotly.react(
			eyePlot.get('div'), 
			data, 
			eyePlot.get('layout'), 
			{ displayModeBar: false, responsive: true }
		);
	};
	
	/**
	* build layout and initialise Plotly 
	* @param {Object} setup
	*/
	const plotlyInit = ( setup ) => {
		
		const eyeSide = setup.eyeSide;
		
		const layout = oePlotly.getLayout({
			darkTheme, // dark?
			legend: {
				yanchor:'bottom',
				y:0.82,
			},
			colors: setup.colors,
			plotTitle: setup.title,
			xaxis: setup.xaxis,
			yaxes: setup.yaxes,
			subplot: 3,		// offScale, VA, IOP, meds 
			rangeSlider: dateRange.firstLast(),
			dateRangeButtons: true,
			
		});
			
		const div = oePlotly.buildDiv(`${oesTemplateType}-${eyeSide}`, '80vh', '650px');
		document.querySelector( setup.parentDOM ).appendChild( div );
		
		// store details
		myPlotly.get( eyeSide ).set('div', div);
		myPlotly.get( eyeSide ).set('layout', layout);
		
		// build
		plotlyReacts( eyeSide );
		
		// set up click through
		oePlotly.addClickEvent( div, setup.eye );
		oePlotly.addHoverEvent( div, eyeSide );
		
		// bluejay custom event (user changes layout)
		document.addEventListener('oesLayoutChange', () => {
			Plotly.relayout( div, layout );
		});	
	}; 
	
	
	/**
	* init - called from the PHP page that needs it
	* @param {JSON} json - PHP supplies the data for charts
	*/
	const init = ( json = null ) => {
		
		if(json === null){
			bj.log(`[oePlotly] - no JSON data provided for Plot.ly ${oesTemplateType} ??`);
			return false;
		} else {
			bj.log(`[oePlotly] - building Plot.ly ${oesTemplateType}`);
		}
		

		// for all subplot rows
		const domainRow = [
			[0, 0.15],
			[0.2, 0.82],
			[0.88, 1],
		];
		
		// user selectable units for VA units:
		userSelecterUnits.init({
			darkTheme,
			plotlyUpdate: plotlyReacts,
			axisDefaults: {
				type:'y',
				rightSide: 'y2',
				domain: domainRow[1],
				title: 'VA',  // prefix for title
				spikes: true,
			}, 
			unitRanges: Object.values( json.yaxis.unitRanges ),
		});


		/**
		* Data 
		*/
	
		if( json.rightEye ){
			myPlotly.set('rightEye', new Map());
			buildDataTraces( json.rightEye, 'rightEye' );
		}
		
		if( json.leftEye ){
			myPlotly.set('leftEye', new Map());
			buildDataTraces( json.leftEye, 'leftEye' );
		}

		/**
		* Axes templates 
		*/
		
		// x1
		const x1 = oePlotly.getAxis({
			type:'x',
			numTicks: 10,
			useDates: true,
			range: dateRange.firstLast(), 
			spikes: true,
			noMirrorLines: true,
		}, darkTheme );
		
		// y0 - offscale 
		const y0 = oePlotly.getAxis({
			type:'y',
			domain: domainRow[0], 
			useCategories: {
				showAll: true, 
				categoryarray: json.yaxis.offScale.reverse()
			},
			spikes: true,
		}, darkTheme );
		
		// y1 - CRT
		const y1 = oePlotly.getAxis({
			type:'y',
			domain: domainRow[1],
			title: 'CRT', 
			range: [200, 650], // hard coded range
			spikes: true,
		}, darkTheme );
		

		// y3 - Events
		const y3 = oePlotly.getAxis({
			type:'y',
			domain: domainRow[2],
			useCategories: {
				showAll: true, 
				categoryarray: json.eventTypes.reverse()
			},
			spikes: true,
		}, darkTheme );
		
		/*
		* Dynamic axis
		* VA axis depends on selected unit state
		*/
		const y2 = userSelecterUnits.selectedAxis();
		
		/**
		* Layout & Build  - Eyes
		*/	
		if( myPlotly.has('rightEye') ){
			
			plotlyInit({
				title: "Right Eye",
				eyeSide: "rightEye",
				colors: "rightEyeSeries",
				xaxis: x1, 
				yaxes: [ y0, y1, y2, y3 ],
				parentDOM: '.oes-left-side',
			});	
		} 
		
		if( myPlotly.has('leftEye') ){
			
			plotlyInit({
				title: "Left Eye",
				eyeSide: "leftEye",
				colors: "leftEyeSeries",
				xaxis: x1, 
				yaxes: [ y0, y1, y2, y3 ],
				parentDOM: '.oes-right-side',
			});			
		}
	};
	
	/**
	* Extend API ... PHP will call with json when DOM is loaded
	*/
	bj.extend('plotSummaryMedicalRetina', init);	
		
})( bluejay ); 