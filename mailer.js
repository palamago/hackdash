
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
	    html: "<h1>HackDash</h1><p>Hi there! "+data.from.name+" wants you to join his project <strong>"+data.project.title+"</strong>.</p>" + 
	    "You must first <a href='" + data.base_url + "/login" + "'>login</a> to create a user and then enter this link: </p>" +
	    "<a href='" + data.hash_url + "'>" + data.hash_url + "</a>"
	};
	transport.sendMail(mailOptions, function(error, response) {
		if(error){
        	console.log(error);
	    }else{
	        console.log("Message sent: " + response.message);
	    }
	});
};
