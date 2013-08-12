
var passport = require('passport')
  , mongoose = require('mongoose')
  , config = require('../config.json');

var User = mongoose.model('User')
  , Project = mongoose.model('Project')
  , Content = mongoose.model('Content')
  , Dashboard = mongoose.model('Dashboard');

module.exports = function(app) {

  /*
   * Dashboard middleware stack
   */

  var dashboardStack = [
    loadUser, 
    loadProviders,
    loadContents,
    setViewVar('statuses', app.get('statuses')),
    render('dashboard')
  ];

  app.get('/install', isAuth, loadUser, loadDashboard, notInstalled, render('installed'));
  app.get('/admin', isAuth, isAdmin, loadUser, loadContents, loadDashboard, render('admin'));
  app.post('/admin', isAdmin, loadUser, saveDashboard, render('admin'));
  app.get('/admin/c/:content_id', loadContent, isAdmin, loadDashboard, render('content_full'));
  //app.get('/admin/content/create', isAuth, isAdmin, loadDashboard, render('new_content'));
  app.post('/admin/content/create', isAuth, isAdmin, validateContent, saveContent, notify(app, 'content_created'), gracefulRes());
  app.get('/admin/content/edit/:content_id', isAuth, isAdmin, dashboardStack, loadContent, render('edit_content'));
  app.post('/admin/content/edit/:content_id', isAuth, isAdmin, validateContent, updateContent, notify(app, 'content_edited'), gracefulRes());
  app.get('/admin/content/remove/:content_id', isAuth, isAdmin, removeContent, notify(app, 'content_removed'), gracefulRes());

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
 * Check if current user is authenticated
 */

var isAuth = function(req, res, next){
  (req.isAuthenticated()) ? next() : res.send(403);
};


/*
 * Add current user template variable
 */

var loadUser = function(req, res, next) {
  res.locals.user = req.user;
  next();
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
 * Check if not installed
 */

var notInstalled = function(req, res, next) {
  Dashboard.findOne({ 'admin': { $exists: true } }, function(err, dash){
    if(!dash || (dash.admin == req.user.id && !req.user.is_admin)) {
      if (!dash) {
        dash = new Dashboard({ admin: req.user.id });
        dash.save(function(){});
      }
      res.locals.user = req.user;
      req.user.is_admin = true;
      req.user.save(function(){
        if(err) return res.send(500);
        next();
      });
    }
    else res.redirect('/');
  });   
};


/**
 * User is dashboard admin
 */

var isAdmin = function(req, res, next) {
	if(req.user.is_admin) next();
	else res.send(403);
};

/*
 * Load dashboard data in res.locals.dashboard
 */ 

var loadDashboard = function(req, res, next) {
  Dashboard.findOne({}, function(err, dash){
    if(err) next(err);
    else if(!dash) res.send(401);
    else {
      res.locals.dashboard = dash;
      next();
    }
  });
};

/*
 * Save the dashboard settings
 */

var saveDashboard = function(req, res, next) {
  var opts = req.body;
  Dashboard.findOne({}, function(err, dash){
    if(err) next(err);
    else if(!dash) res.send(401);
    else {
      dash.title = opts.title || dash.title;
      dash.description = opts.description || dash.description;
      dash.background = opts.background || dash.background;
      dash.credits = opts.credits;
      dash.license = opts.license;
      dash.help = opts.help || dash.help;
      dash.save(function(err, doc){
        res.locals.dashboard = doc;
        next();
      });
    }
  });
};


/*
 * Check content fields
 */

var validateContent = function(req, res, next) {
  if(req.body.title && req.body.description) next();
  else res.send(500, "Content Title and Description fields must be complete.");
};

/*
 * Save new content
 */

var saveContent = function(req, res, next) {
  var content = new Content({
      title: req.body.title
    , abstract: req.body.abstract
    , description: req.body.description
    , link: req.body.link
    , tags: req.body.tags && req.body.tags.length ? req.body.tags.split(',') : []
    , created_at: Date.now()
    , creator: req.user._id
    , cover: req.body.cover
  });

  content.save(function(err, content){
    if(err) return res.send(500); 
    res.locals.content = content;
    next();
  });
};

/*
 * Remove a content
 */

var removeContent = function(req, res, next) {
  res.locals.content = {id: req.content.id, title: req.content.title};

  req.content.remove(function(err){
    if(err) res.send(500);
    else next();
  });
};

/*
 * Update existing content
 */

var updateContent = function(req, res, next) {
  var content = req.content;

  content.title = req.body.title || content.title;
  content.description = req.body.description || content.description;
  content.link = req.body.link || content.link;
  content.category = req.body.category || content.category;
  content.cover = req.body.cover || content.cover;

  content.save(function(err, content){
    if(err) return res.send(500);
    res.locals.content = content;
    next();
  });
};

/*
 * Load all contents
 */

var loadContents = function(req, res, next) {
  Content.find(req.query || {})
  .exec(function(err, contents) {
    if(err) return res.send(500);
    res.locals.contents = contents;
    res.locals.user = req.user;
    res.locals.canView = true;
    res.locals.canEdit = req.user.is_admin;
    res.locals.canRemove = req.user.is_admin;
    res.locals.userExists = userExistsInArray;
    next();
  });
};

/*
 * Load specific content
 */

var loadContent = function(req, res, next) {
  Content.findById(req.params.content_id)
  .exec(function(err, content) {
    if(err || !content) return res.send(500);
    res.locals.content = content;
    res.locals.user = req.user;
    res.locals.canEdit = req.user.is_admin;
    res.locals.canRemove = req.user.is_admin;
    res.locals.disqus_shortname = config.disqus_shortname;
    res.locals.userExists = userExistsInArray;
    next();
  });
};

var userExistsInArray = function(user, arr){
  return _.find(arr, function(u){
    return (u.id == user.id);
  });
};

/*
 * Emit a notification
 */

var notify = function(app, type) {
	return function(req, res, next) {
		app.emit('post', {type: type, content: res.locals.content, user: req.user});
		next();
	};
};


/*
 * Return something good
 */

var gracefulRes = function(msg) {
  return function(req, res) {
    res.json(msg && {msg: msg} ||{err: null, id: res.locals.content.id});
  };
};
