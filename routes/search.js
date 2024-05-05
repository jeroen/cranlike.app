/* Packages */
const express = require('express');
const createError = require('http-errors');
const router = express.Router();
const tools = require("../src/tools.js");
const qf = tools.qf;

function error_cb(status, next) {
  return function(err) {
    console.log("[Debug] HTTP " + status + ": " + err)
    next(createError(status, err));
  }
}

function build_query(query, str){
  function substitute(name, field, insensitive, partial){
    var re = new RegExp(`${name}:(\\S+)`, "i"); //the name is insensitive e.g.: "Package:jsonlite"
    var found = str.match(re);
    if(found && found[1]){
      var search = found[1];
      if(insensitive || partial){
        search = search.replaceAll("+", "."); //search for: "author:van+buuren" or "topic:open+data"
        var regex = partial ? search : `^${search}$`;
        var opt = insensitive ? 'i' : '';
        query[field] = {$regex: regex, $options: opt}
      } else {
        query[field] = search;
      }
      str = str.replace(re, "");
    }
  }
  function match_exact(name, field){
    substitute(name, field)
  }
  function match_insensitive(name, field){
    substitute(name, field, true)
  }
  function match_partial(name, field){
    substitute(name, field, true, true)
  }
  function match_exists(name, field){
    var re = new RegExp(`${name}:(\\S+)`, "i");
    var found = str.match(re);
    if(found && found[1]){
      var findfield = found[1].toLowerCase(); //GH logins are normalized to lowercase
      query[`${field}.${findfield}`] = { $exists: true };
      str = str.replace(re, "");
    }
  }
  match_partial('author', 'Author');
  match_partial('maintainer', 'Maintainer');
  match_exact('needs', '_rundeps');
  match_exists('contributor', '_contributions');
  match_insensitive('topic', '_topics');
  match_insensitive('exports', '_exports');
  match_insensitive('package', 'Package');
  match_insensitive('owner', '_owner');
  match_insensitive('universe', '_user');
  match_partial('data', '_datasets.title');
  str = str.trim();
  if(str){
    query['$text'] = { $search: str, $caseSensitive: false};
  }
  return query;
}

router.get("/:user/stats/powersearch", function(req, res, next) {
  var query = qf({_user: req.params.user, _type: 'src', _registered : true}, req.query.all);
  var query = build_query(query, req.query.q || "");
  var project = {
    Package: 1,
    Title: 1,
    Description:1,
    _user:1,
    _owner: 1,
    _score: 1,
    _usedby: 1,
    maintainer: '$_maintainer',
    updated: '$_commit.time',
    stars: '$_stars',
    topics: '$_topics',
    sysdeps: '$_sysdeps.name',
    rundeps: '$_rundeps'
  };
  if(query['$text']){
    project.match = {$meta: "textScore"};
    project.rank = {$multiply:[{$meta: "textScore"}, '$_score']};
  } else {
    project.rank = '$_score';
  }
  var limit =  parseInt(req.query.limit) || 100;
  var skip =  parseInt(req.query.skip) || 0;
  var cursor = packages.aggregate([
    { $match: query},
    { $project: project},
    { $sort: {rank: -1}},
    { $facet: {
        results: [{ $skip: skip }, { $limit: limit }],
        stat: [{$count: 'total'}]
      }
    }
  ]);
  cursor.next().then(function(out){
    out.query = query;
    out.skip = skip;
    out.limit = limit;
    if(out.stat && out.stat.length){
      out.total = out.stat[0].total;
    }
    //remove fields unrelated to the search
    delete out.query._type;
    delete out.query._registered;
    delete out.query._indexed;
    delete out.stat;
    return res.send(out);
  }).catch(error_cb(400, next));
});

module.exports = router;