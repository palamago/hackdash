var passport = require('passport')
  , mongoose = require('mongoose')
  , moment = require('moment')
  , config = require('../config.json')
  , _ = require('underscore')
  , fs = require('fs')
  , request = require('superagent');

var User = mongoose.model('User')
  , Project = mongoose.model('Project')
  , Content = mongoose.model('Content')
  , Category = mongoose.model('Category');

module.exports = function(app) {
  app.locals.canCreate = userCanCreate
  app.locals.stageCanCreate = stageCanCreate

  app.get('/api/projects', loadProjects, render('projects'));
  app.post('/api/projects/create', isAuth, canCreate, validateProject, saveProject, notify(app, 'project_created'), gracefulRes());
  app.get('/api/projects/remove/:project_id', isAuth, canRemove, removeProject, notify(app, 'project_removed'), gracefulRes());
  app.get('/api/projects/create', isAuth, canCreate, setViewVar('statuses', app.get('statuses')), render('new_project'));
  app.post('/api/cover', isAuth, uploadCover);
  app.get('/api/projects/edit/:project_id', isAuth, setViewVar('statuses', app.get('statuses')), canEdit, loadProject, render('edit'));
  app.post('/api/projects/edit/:project_id', isAuth, canEdit, validateProject, updateProject, notify(app, 'project_edited'), gracefulRes());
  app.get('/api/projects/join/:project_id', isAuth, joinProject, followProject, loadProject, notify(app, 'project_join'), sendMail(app, 'join'), gracefulRes()); 
  app.get('/api/projects/leave/:project_id', isAuth, isProjectMember, leaveProject, loadProject, notify(app, 'project_leave'), gracefulRes()); 
  app.get('/api/projects/follow/:project_id', isAuth, followProject, loadProject, notify(app, 'project_follow'), gracefulRes()); 
  app.get('/api/projects/unfollow/:project_id', isAuth, isProjectFollower, unfollowProject, loadProject, notify(app, 'project_unfollow'), gracefulRes()); 
  app.get('/api/p/:project_id', loadProject, render('project_full'));

  app.get('/api/contents', loadContents, render('contents'));
  app.get('/api/c/:content_id', loadContent, render('content_full'));
  app.get('/api/contents/edit/:content_id', isAuth, isAdmin, loadContent, render('edit_content'));
  app.post('/api/contents/edit/:content_id', isAuth, isAdmin, validateContent, updateContent, notify(app, 'content_edited'), gracefulResCont());
  app.get('/api/search', prepareSearchQuery, loadProjects, render('projects'));
  app.get('/api/users/profile', isAuth, loadUser, userIsProfile, render('edit_profile'));
  app.get('/api/users/:user_id', loadUser, findUser, render('profile'));
  app.post('/api/users/:user_id', isAuth, updateUser, gracefulRes('ok!'));
};

/*
 * Render templates
 */
var render = function(path) {
  return function(req, res) { 
    res.render(path, function(err, html){
      if(err) return res.send(500);
      res.json({html: html});
    });
  };
};


/*
 * Render jade view
 */
var renderView = function(path) {
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

/*
 * Emit a notification
 */

var notify = function(app, type) {
	return function(req, res, next) {
		app.emit('post', {type: type, project: res.locals.project, user: req.user});
		next();
	};
};

/**
 * Send email
 */

var sendMail = function(app, type) {
	return function(req, res, next) {
		if(!app.get('config').mailer) return next();
		app.emit('mail', {
			type: type,
			from: req.user,
			to: res.locals.project.leader,
			project: res.locals.project
		});
		next();
	};
};

/*
 * Add current user template variable
 */

var loadUser = function(req, res, next) {
  res.locals.user = req.user;
  next();
};

/**
 * Add a user info to the response
 */

var findUser = function(req, res, next){
  User.findById(req.params.user_id, function(err, user){
    if(err) return res.send(404);
    res.locals.user_profile = user;
    next();
  });
};

/*
 * Update existing User
 */

var updateUser = function(req, res, next) {
  var user = req.user;
  
  user.name = req.body.name;
  user.email = req.body.email;
  user.bio = req.body.bio;

  user.save(function(err, user){
    if(err) {

      res.locals.errors = [];
      if (err.errors.hasOwnProperty('email')){
        res.locals.errors.push('Invalid Email');  
      }

      res.locals.user = req.user;

      res.render('edit_profile');
    }
    else {
      res.locals.user = user;
      next();
    }
  });
};

var userIsProfile = function(req, res, next) {
  res.locals.user_profile = req.user;
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
 * Check if current user is authenticated
 */

var isAuth = function(req, res, next){
  (req.isAuthenticated()) ? next() : res.send(403);
};

/**
 * User is dashboard admin
 */

var isAdmin = function(req, res, next) {
	if(req.user.is_admin) next();
	else res.send(403);
};
/*
 * Check if current user can create Projects
 */

var canCreate = function(req, res, next) {
  if (!userCanCreate(req.user))
    return res.send(401)
  next();
}

/*
 * Check if current user can remove this project.
 */

var canRemove = function(req, res, next) {
  return canPermission(req, res, next, 'remove')
}

/*
 * Check if current user can edit this project.
 */

var canEdit = function(req, res, next) { 
  return canPermission(req, res, next, 'edit')
}

/*
 * Check if current user can view this project.
 */

var canView = function(req, res, next) {
  return canPermission(req, res, next, 'view')
}

/*
 * Check if current user can do the selected action. 
 * Being posible values ['edit', 'remove', 'view']
 */

var canPermission = function(req, res, next, action){
  Project.findById(req.params.project_id)
  .populate('leader')
  .exec(function(err, project) {
    if (err || !project) return res.send(404);
    switch ( action ) {
      case 'edit':
        if (!userCanEdit(req.user, project))
          return res.send(401);
        break;
      case 'remove':
        if (!userCanRemove(req.user, project))
          return res.send(401);
        break;
      case 'view':
        if (!userCanView(req.user, project))
          return res.send(401);
        break;
      default:
        return res.send(401);
        break;
    }
    req.project = project;
    next();
  });
};


/*
 * Load all projects
 */

var loadProjects = function(req, res, next) {
  Project.find(req.query || {})
  .populate('contributors')
  .populate('followers')
  .populate('leader')
  .exec(function(err, projects) {
    if(err) return res.send(500);
    res.locals.projects = projects;
    res.locals.user = req.user;
    res.locals.canView = userCanView;
    res.locals.canEdit = userCanEdit;
    res.locals.canRemove = userCanRemove;
    res.locals.userExists = userExistsInArray;
    next();
  });
};

/*
 * Load specific project
 */

var loadProject = function(req, res, next) {
  Project.findById(req.params.project_id)
  .populate('contributors')
  .populate('followers')
  .populate('leader')
  .exec(function(err, project) {
    if(err || !project) return res.send(500);
    res.locals.project = project;
    res.locals.user = req.user;
    res.locals.canEdit = userCanEdit;
    res.locals.canRemove = userCanRemove;
    res.locals.disqus_shortname = config.disqus_shortname;
    res.locals.userExists = userExistsInArray;
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
    res.locals.canEdit = true;
    res.locals.canRemove = true;
    res.locals.disqus_shortname = config.disqus_shortname;
    res.locals.userExists = true;
    next();
  });
};

var userExistsInArray = function(user, arr){
  return _.find(arr, function(u){
    return (u.id == user.id);
  });
};


/*
 * Check content fields
 */

var validateContent = function(req, res, next) {
  if(req.body.title && req.body.description) next();
  else {
    res.send(500, "Content Title and Description fields must be complete.");
  }
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
  Content.findById(req.params.content_id)
  .exec(function(err, content) {
    if (err || !content) return res.send(404);
    	console.log(content);
	  //var content = req.content;
	  content.title = req.body.title;
	  content.description = req.body.description;
	  content.link = req.body.link || content.link;
	  content.tags = (req.body.tags && req.body.tags.split(','));
	  content.cover = req.body.cover || content.cover;

	  content.save(function(err, content){
		if(err) return res.send(500);
		res.locals.content = content;
		next();
	  });
  });

};


/*
 * Load searched projects
 * TODO: use mongoose plugin for keywords
 */

var prepareSearchQuery = function(req, res, next) {
  var regex = new RegExp(req.query.q, 'i');
  var query = {};

  if(!req.query.q.length) return res.redirect('/api/projects');
  if(req.query.type === "title") query['title'] = regex;
  else if(req.query.type === "tag") query['tags'] = regex;
  else return res.send(500);

  req.query = query;

  next();
};

/*
 * Check project fields
 */

var validateProject = function(req, res, next) {
  if(req.body.title && req.body.description) next();
  else res.send(500, "Project Title and Description fields must be complete.");
};

/*
 * Save new project
 */

var saveProject = function(req, res, next) {
  var project = new Project({
      title: req.body.title
    , description: req.body.description
    , link: req.body.link
    , tags: req.body.tags && req.body.tags.length ? req.body.tags.split(',') : []
    , created_at: Date.now()
    , leader: req.user._id
    , followers: [req.user._id]
    , contributors: [req.user._id]
    , cover: req.body.cover
    , video: req.body.video
  });

  project.save(function(err, project){
    if(err) return res.send(500); 
    res.locals.project = project;
    next();
  });
};

/*
 * Remove a project
 */

var removeProject = function(req, res, next) {
  res.locals.project = {id: req.project.id, title: req.project.title};

  req.project.remove(function(err){
    if(err) res.send(500);
    else next();
  });
};

/*
 * Update existing project
 */

var updateProject = function(req, res, next) {
  var project = req.project;

  project.title = req.body.title || project.title;
  project.description = req.body.description || project.description;
  project.link = req.body.link;
  project.status = req.body.status || project.status;
  project.cover = req.body.cover || project.cover;
  project.video = req.body.video;
  project.tags = (req.body.tags && req.body.tags.split(','));

  project.save(function(err, project){
    if(err) return res.send(500);
    res.locals.project = project;
    next();
  });
};

/*
 * Upload cover if exist
 */

var uploadCover = function(req, res, next) {
  var cover = (req.files && req.files.cover && req.files.cover.type.indexOf('image/') != -1 
    && '/uploads/' + req.files.cover.path.split('/').pop() + '.' + req.files.cover.name.split('.').pop());
  console.log(cover);
  if(req.files && req.files.cover && req.files.cover.type.indexOf('image/') != -1) {
    var tmp_path = req.files.cover.path
      , target_path = __dirname+'/../public' + cover;
    console.log(tmp_path);
    fs.rename(tmp_path, target_path, function(err) {
      if (err) throw err;
      fs.unlink(tmp_path, function() {
        if (err) throw err;
        res.json({href: cover});
      });
    });
  }
};

/*
 * Check if current user is member of a project
 */

var isProjectMember = function(req, res, next) {
  Project.findOne({_id: req.params.project_id, contributors: req.user.id}, function(err, project){
    if(err || !project) return res.send(500);
    req.project = project;
    next(); 
  });
};

/*
 * Check if current user is follower of a project
 */

var isProjectFollower = function(req, res, next) {
  Project.findOne({_id: req.params.project_id, followers: req.user.id}, function(err, project){
    if(err || !project) return res.send(500);
    req.project = project;
    next(); 
  });
};

 /*
 * Add current user as a group contributor
 */

var joinProject = function(req, res, next) {
  Project.update({_id: req.params.project_id}, { $addToSet : { 'contributors': req.user.id }}, function(err){
    if(err) return res.send(500);
    next();
  });
};

/*
 * Remove current user from a group
 */

var leaveProject = function(req, res, next) {
  Project.update({_id: req.params.project_id}, { $pull: {'contributors': req.user._id }}, function(err){
    if(err) return res.send(500);
    next();
  });
};

/*
 * Add current user as project follower
 */

var followProject = function(req, res, next) {
  Project.update({_id: req.params.project_id}, { $addToSet : { 'followers': req.user.id }}, function(err){
    if(err) return res.send(500);
    next();
  });
};

/*
 * Unfollow
 */

var unfollowProject = function(req, res, next) {
  Project.update({_id: req.params.project_id},{ $pull: {'followers': req.user._id }}, function(err){
    if(err) return res.send(500);
    next();
  });
};

/*
 * Return something good
 */

var gracefulRes = function(msg) {
  return function(req, res) {
    res.json(msg && {msg: msg} ||{err: null, id: res.locals.project.id});
  };
};

/*
 * Return something good for content
 */

var gracefulResCont = function(msg) {
  return function(req, res) {
    res.json(msg && {msg: msg} ||{err: null, id: res.locals.content.id});
  };
};


/*
 *  Returns the first stage that wraps the actual time
 */

var actualStage = function() {
  if (config['stages']) {
    momentNow = moment(Date())
    for ( var i = 0; i < config['stages'].length; i++ ) {
      var stageStart = config['stages'][i]['start'];
      var stageEnd = config['stages'][i]['end'];
      var isBeforeEnd = !stageEnd || momentNow.isBefore(stageEnd);
      var isAfterStart = !stageStart || momentNow.isAfter(stageStart);
      if (isBeforeEnd && isAfterStart)
        return config['stages'][i]
    }
  }
}

/*
 * Check an stage for permissions
 */

var stageHasPermission = function(stage, permission) {
  if (!stage) 
    return false;

  return _.find(stage['permissions'], function(u){
    return (u == permission);
  });
}

/*
 * Tells if the actual stage has permissions to create
 */

var stageCanCreate = function() {
  return stageHasPermission(actualStage(), 'create');
}

/*
 * Tells if the user can create projects
 */

var userCanCreate = function(user) {
  // Anonymous can't create
  if ( !user )
    return false;

  // Admin, always can create
  if (user.is_admin) 
    return true;

  // If we are on no stage (and not admin) user can't create
  var stage = actualStage();
  if (!stage)
    return false;

  // Otherwise, it dependes on the stage
  return stageHasPermission(stage, 'create')
};

/*
 * Tells if the user can remove a project
 */

var userCanRemove = function(user, project) {
  // Anonymous can't remove
  if (!user)
    return false;

  // Admin, always can remove
  if (user.is_admin)
    return true;

  // If we are on no stage (and not admin) user can't remove
  var stage = actualStage();
  if (!stage)
    return false;

  // If stage has no permission to create, then no permission to remove
  if ( !stageHasPermission(stage, 'create') )
    return false;

  // If stage has permission but the user is not leader, then user can't remove
  if (user.id !== project.leader.id )
    return false;

  // Otherwise (not admin, stage with permission, and leader), user can remove!! :D
  return true;
}

/*
 * Tells if the user can edit a project
 */

var userCanEdit = function(user, project) {
  // Anonymous can't edit
  if ( !user )
    return false;

  // Admin, always can edit
  if (user.is_admin)
    return true;

  // If we are on no stage (and not admin) user can't edit
  var stage = actualStage();
  if ( !stage )
    return false;

  // If the stage has no permission to edit or create user can't edit
  if ( !stageHasPermission(stage, 'edit') && !stageHasPermission(stage, 'create'))
    return false;

  // If the stage has permission but the user is not the leader, user can't edit
  if (user.id !== project.leader.id )
    return false;

  // Otherwise (not admin, stage with permission, and leader) user can edit!! :D
  return true;
  
};

/*
 * Tells if the user can view a project
 */

var userCanView = function(user, project) {
  var stage = actualStage()

  // Anonymous user search for permission on stage
  if ( !user ) 
    return stage && stageHasPermission(stage, 'view-anonymous')

  // Admin, always can view
  if (user.is_admin)
    return true;

  // If the user is the leader or a contributor they can always see the project.
  if ( user.id === project.leader.id || userExistsInArray(user, project.contributors ) )
    return true;

  // If we are on no stage (and not admin, and not contributor) user can't view
  if ( !stage )
    return false;

  // Otherwise, it depends on the stage
  return  stageHasPermission(stage, 'view')
}
