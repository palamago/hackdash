
var passport = require('passport')
  , config = require('../config.json')
  , mongoose = require('mongoose')
  , moment = require('moment');

var User = mongoose.model('User')
  , Project = mongoose.model('Project')
  , Dashboard = mongoose.model('Dashboard')
  , Invitation = mongoose.model('Invitation');

module.exports = function(app) {

  /*
   * Dashboard middleware stack
   */

  var dashboardStack = [
    loadUser, 
    loadProviders,
    loadDashboard,
    setViewVar('statuses', app.get('statuses')),
    setViewVar('disqus_shortname', config.disqus_shortname),
    render('dashboard')
  ];

  var liveStack = [
    isLive(app),
    loadUser, 
    loadProviders,
    loadDashboard,
    setViewVar('statuses', app.get('statuses')),
    setViewVar('disqus_shortname', config.disqus_shortname),
    setViewVar('live', true),
    render('live')
	];

  app.get('/', checkProfile, dashboardStack);
  app.get('/live', liveStack);
  app.get('/login', dashboardStack);
  app.get('/projects/create', dashboardStack);
  app.get('/projects/edit/:project_id', dashboardStack);

  app.get('/projects/invite/:project_id', dashboardStack);
  app.get('/projects/join/:project_id/:invitation_hash', join, redirect('/'))

  app.get('/p/:project_id', dashboardStack);
  app.get('/search', dashboardStack);
  app.get('/logout', logout, redirect('/'));
  
  app.get('/about', loadUser, render('about'));

  app.get('/users/profile', dashboardStack);
  app.get('/users/:user_id', dashboardStack);
};

/*
 * Render templates
 */
var render = function(path) {
  return function(req, res) {
    res.render(path);
  };
};

/*
 * Redirect to a route
 */

var redirect = function(route) {
  return function(req, res) {
    res.redirect(route);
  };
};

var checkProfile = function(req, res, next){
  if (req.user && !req.user.email){
    res.redirect('/users/profile');
  }

  next();
};

var isLive = function(app) {
	return function(req, res, next) {
		if(app.get('config').live) {
			next();
		} else {
			res.send(404);
		}
	}
};

/*
 * Add current user template variable
 */

var loadUser = function(req, res, next) {
  res.locals.errors = [];
  res.locals.user = req.user;
  next();
};


/*
 * Check if current user is authenticated
 */

var isAuth = function(req, res, next){
  (req.isAuthenticated()) ? next() : res.send(403);
};

/*
 * Makes vars available to views
 */

var setViewVar = function(key, value) {
  return function(req, res, next) {
    res.locals[key] = value;
    next();
  };
};  

/*
 * Load app providers
 */

var loadProviders = function(req, res, next) {
  res.locals.providers = req.app.get('providers');
  next();
};

/*
 * Load specific project
 */

var loadProject = function(req, res, next) {
  Project.findById(req.params.project_id)
  .populate('contributors')
  .populate('pending')
  .populate('leader')
  .exec(function(err, project) {
    if(err || !project) return res.send(500);
    res.locals.project = project;
    res.locals.user = req.user;
    next();
  });
};

/*
 * Load dashboard
 */

var loadDashboard = function(req, res, next) {
  Dashboard.findOne({}, function(err, dash) {
    if (err) return res.send(404);
    else if(!dash) {
      var dash = new Dashboard({});
      dash.save(function(err, doc){
        res.locals.dashboard = dash;
        next();
      });
    }
    else {
      res.locals.dashboard = dash;
      next();
    } 
  });
};

/*
 * Log out current user
 */

var logout = function(req, res, next) {
  req.logout();
  next();
};

/*
 * Join
 */

var join = function(req, res, next) {
  if (!req.user) 
    return res.send(404);
  Invitation.findOne({project: req.params.project_id, hash: req.params.invitation_hash})
  .populate('project')
  .exec(function(err, invitation) {
    if (err || !invitation) 
      return res.send(404);
    if ( moment(Date()).subtract('days', 2).isAfter(invitation.created_at) )
      return res.send(401)
    Project.update({_id: req.params.project_id}, { $addToSet : { 'contributors': req.user.id }}, function(err){
      if(err) return res.send(500);
      next();
    });
  });
};