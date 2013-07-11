
/**
 * Module dependencies
 */

var nodemailer = require('nodemailer');

/**
 * Expose config function
 */
var transport;

module.exports = function(app) {
	transport = nodemailer.createTransport("SMTP", app.get('config').mailer);
	app.on('mail', handleMail);
};

var handleMail = function(data){
	switch(data.type) {
		case "join":
			sendJoinMail(data);
			break;
		case "invite":
			sendInvitationMail(data);
			break;
	}
};

var sendJoinMail = function(data) {
	var mailOptions = {
    from: data.from.email,
    to: data.to.email,
    subject: "[HackDash] " + data.from.email + " joined your project!",
		// TODO change this
    html: "<h1>HackDash</h1><p>Hi there! "+data.from.name+" Joined your project <strong>"+data.project.title+"</strong>.</p>"
	};
	transport.sendMail(mailOptions);
};

var sendInvitationMail = function(data) {
	var mailOptions = {
	    from: data.from.email,
	    to: data.to,
	    subject: "[HackDash] " + data.from.name + " wants you to join " + data.project.title,
			// TODO change this
	    html: "<h1>HackDash</h1><p>Hi there! "+data.from.name+" wants you to join his project <strong>"+data.project.title+"</strong>.</p><p> <a href='" + data.hash + "'>" + data.hash + "</a>"
	};
	console.log('todo bien')
	console.log(data.from.email)
	console.log(data.to)
	transport.sendMail(mailOptions, function(error, response) {
		console.log('algo')
		if(error){
        	console.log(error);
	    }else{
	        console.log("Message sent: " + response.message);
	    }
	});
};
