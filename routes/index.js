
module.exports = function(app) {

  app.locals.moment = require('moment');
  app.locals.md = require('markdown').markdown.toHTML;

  app.locals.isLeader = function(user, project) {
    return (user.is_admin || user.id === project.leader.id);
  };

  app.locals.getVideoEmbed = function(string) {
	vimeo_regex=/^http:\/\/vimeo.com\/([0-9\.]+)$/
    vimeo_r=string.match(vimeo_regex);
	if(vimeo_r) return('http://player.vimeo.com/video/'+vimeo_r[1]);
	youtube_regex=/^http:\/\/www.youtube.com\/watch\?v=([A-Za-z0-9\.]+)$/
    youtube_r=string.match(youtube_regex);
	if(youtube_r) return('http://www.youtube.com/embed/'+youtube_r[1]);
	youtube_regex=/^http:\/\/youtu.be\/([A-Za-z0-9\.]+)$/
    youtube_r=string.match(youtube_regex);
	if(youtube_r) return('http://www.youtube.com/embed/'+youtube_r[1]);
	return false;
  };  
  
  app.locals.getGalleryEmbed = function(string) {
	imgur_regex=/^http:\/\/imgur.com\/a\/([A-Za-z0-9\.]+)$/
    imgur_r=string.match(imgur_regex);
	if(imgur_r) return('http://imgur.com/a/'+imgur_r[1]);
	return false;
  };

  require('./site')(app);
  require('./api')(app);
  require('./admin')(app);

};
