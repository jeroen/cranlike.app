/* Express template stuff */
var createError = require('http-errors');
var express = require('express');
var cors = require('cors')
var path = require('path');
var logger = require('morgan');

/* Database */
const assert = require('assert');
const mongodb = require('mongodb');

/* Routers */
var manRouter = require('./routes/man');
var cdnRouter = require('./routes/cdn');
var packagesRouter = require('./routes/packages');
var reposRouter = require('./routes/repos');
var searchRouter = require('./routes/search');
var badgesRouter = require('./routes/badges');
var feedsRouter = require('./routes/feeds');
var craninfoRouter = require('./routes/craninfo');
var scienceMinerRouter = require('./routes/scienceminer');

/* Connect to DB */
const HOST = process.env.CRANLIKE_MONGODB_SERVER || 'localhost';
const PORT = process.env.CRANLIKE_MONGODB_PORT || 27017;
const USER = process.env.CRANLIKE_MONGODB_USERNAME || 'root';
const PASS = process.env.CRANLIKE_MONGODB_PASSWORD;
const AUTH = PASS ? (USER + ':' + PASS + "@") : "";
const URL = 'mongodb://' + AUTH + HOST + ':' + PORT;
const connection = mongodb.MongoClient.connect(URL, {useUnifiedTopology: true});
connection.then(async function(client) {
  const db = client.db('cranlike');
  global.bucket = new mongodb.GridFSBucket(db, {bucketName: 'files'});
  global.packages = db.collection('packages');
  global.chunks = db.collection('files.chunks');

  /* Speed up common query fields */
  /* NB: Dont use indexes with low cardinality (few unique values) */
  await packages.createIndex("MD5sum");
  await packages.createIndex("_user");
  await packages.createIndex("_published");
  await packages.createIndex("_builder.commit.time");
  await packages.createIndex("_builder.maintainer.login");
  await packages.createIndex({"_user":1, "_type":1, "Package":1});
  await packages.createIndex({"_user":1, "_builder.commit.id":1, "Package":1});
  await packages.createIndex({"_user":1, "_type":1, "_builder.commit.time":1});
  await packages.createIndex({"_user":1, "_type":1, "_registered":1, "_builder.commit.time":1});
  await packages.createIndex({"_builder.maintainer.login":1, "_selfowned":1, "_builder.commit.time":1});

  /* The text search index (only one is allowed) */
  //await packages.dropIndex("textsearch").catch(console.log);
  await packages.createIndex({
    _type:1,
    Package: "text",
    _owner: "text",
    Title: "text",
    Author: "text",
    Description: "text",
    '_contents.vignettes.title': "text",
    '_builder.maintainer.name': "text",
    '_contents.gitstats.topics': "text",
    '_contents.sysdeps.name': "text",
    '_contents.exports' : "text",
    '_contents.datasets.title' : "text"
  },{
    weights: {
      Package: 50,
      _owner: 20,
      Title: 5,
      Author: 3,
      Description: 1,
      '_contents.vignettes.title': 5,
      '_builder.maintainer.name': 10,
      '_contents.gitstats.topics': 10,
      '_contents.sysdeps.name': 20,
      '_contents.exports' : 3,
      '_contents.datasets.title' : 3
    },
    name: "textsearch"
  });

  //await packages.dropIndex("_user_1__type_1__registered_1").catch(console.log);
  packages.indexes().then(function(x){
    console.log("Current indexes() for packages:")
    console.log(x);
  });
}).catch(function(error){
  // not sure what this would solve, maybe remove it?
  assert.ifError(error);
});

/* Start App */
var app = express();

/* Prettify all JSON responses */
app.set('json spaces', 2)

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(cors())
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use('/assets', express.static(path.join(__dirname, 'assets')));
app.use('/', manRouter);
app.use('/', cdnRouter);
app.use('/', packagesRouter);
app.use('/', reposRouter);
app.use('/', searchRouter);
app.use('/', badgesRouter);
app.use('/', feedsRouter);
app.use('/', craninfoRouter);
app.use('/', scienceMinerRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
