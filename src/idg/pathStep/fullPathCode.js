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
			case "PSD-A" : full = "PSD: Haider Special Mix Set"; break;
			case "PSD-B-overview":
			case "PSD-B" : full = "PSD: Pre Op drops"; break;
			case "PSD-C-overview":
			case "PSD-C" : full = "PGD: HCA Nightingale"; break;
			case "PSD-D" : full = "David Haider (Custom)"; break;
		}
		
		return full; 
	}; 
		
})( bluejay ); 