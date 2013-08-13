
var mongoose = require('mongoose')
  , Schema = mongoose.Schema
  , ObjectId = Schema.ObjectId;

module.exports = function(app) {

  var User = new Schema({
      "provider": { type: String, required: true }
    , "provider_id": { type: Number, required: true }
    , "username": { type: String, required: true }
    , "name": { type: String, required: true }
    , "email": { type: String, validate: /.+@.+\..+/ }
    , "picture": String
    , "bio": String
    , "is_admin": { type: Boolean, default: false }
    , "created_at": {type: Date, default: Date.now }
  });

  mongoose.model('User', User);

  var Category = new Schema({
      "name": String
    , "description": String
    , "created_at": {type: Date, default: Date.now }
  });

  mongoose.model('Category', Category);

  var Project = new Schema({
      "title": { type: String, required: true }
    , "description": { type: String, required: true }
    , "leader": { type: ObjectId, required: true, ref: 'User' }
    //, "status": { type: String, enum: app.get('statuses'), default: app.get('statuses')[0] }
    , "contributors": [{ type: ObjectId, ref: 'User'}]
    , "followers": [{ type: ObjectId, ref: 'User'}]
    , "category": { type: ObjectId, ref: 'Category'}
    , "cover": String
    , "link": String 
	, "gallery": String
	, "video": String
    , "tags": [String]
    , "created_at": { type: Date, default: Date.now }
  });

  mongoose.model('Project', Project);

  var Dashboard = new Schema({
      "admin": { type: ObjectId, ref: 'User' }
    , "title": { type: String, default: "HackDash" }
    , "description": { type: String, default: "A dashboard for Hackatons" }
    , "background": { type: String, default: "#1e1d22" }
    , "credits": { type: String, default: "GCBA - Ministerio de Modernización" }
    , "license": { type: String, default: "2013 - CC by SA" }
    , "help": { type: String, default: "Text that appears along project create form" }
    , "created_at": { type: Date, default: Date.now }
  });

  Dashboard.path('description').validate(function(value) {
    value.length <= 140;
  });

  mongoose.model('Dashboard', Dashboard);


  var Content = new Schema({
      "title": { type: String, required: true }
    , "abstract": { type: String, required: true }
    , "description": { type: String, required: true }
    , "creator": { type: ObjectId, required: true, ref: 'User' }
    , "category": { type: ObjectId, ref: 'Category'}
    , "tags": [String]
    , "cover": String
    , "link": String 
    , "created_at": { type: Date, default: Date.now }
  });

  Content.path('description').validate(function(value) {
    value.length <= 540;
  });

  mongoose.model('Content', Content);


};
