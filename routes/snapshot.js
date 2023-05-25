const express = require('express');
const createError = require('http-errors');
const zlib = require('zlib');
const router = express.Router();
const archiver = require('archiver');
const path = require('node:path');
const tools = require("../src/tools.js");
const pkgfields = tools.pkgfields;
const doc_to_dcf = tools.doc_to_dcf;

function error_cb(status, next) {
  return function(err){
    console.log("[Debug] HTTP " + status + ": " + err)
    next(createError(status, err));
  }
}

function new_zipfile(format){
  /* contents are already compressed */
  const archive = archiver(format, {
    store: true, gzip: true, gzipOptions: {level: 1},
  });
  return archive.on('warning', function(err) {
    if (err.code === 'ENOENT') {
      console.log(err)
    } else {
      throw err;
    }
  }).on('error', function(err) {
    throw err;
  })
}

function make_filename(doc){
  var type = doc._type;
  if(type == 'src'){
    return `src/contrib/${doc.Package}_${doc.Version}.tar.gz`;
  }
  var built = doc.Built && doc.Built.R && doc.Built.R.substring(0,3);
  if(type == 'win'){
    return `bin/windows/contrib/${built}/${doc.Package}_${doc.Version}.zip`;
  }
  if(type == 'mac'){
    //TODO: fix arm64 m1 distro here, once supported
    var distro = built == '4.2' ? 'macosx' : 'macosx/big-sur-x86_64';
    return `bin/${distro}/contrib/${built}/${doc.Package}_${doc.Version}.tgz`;
  }
  if(type == 'linux'){
    var distro = doc.Distro || 'linux';
    return `bin/linux/${distro}/${built}/src/contrib/${doc.Package}_${doc.Version}.tar.gz`;
  }
  throw `Unsupported type: ${type}`;
}

function packages_snapshot(files, archive){
  var indexes = {};
  var promises = files.map(function(x){
    var hash = x.MD5sum;
    var date = x._created;
    var filename = make_filename(x);
    var dirname = path.dirname(filename);
    if(!indexes[dirname])
      indexes[dirname] = [];
    indexes[dirname].push(x);
    return bucket.find({_id: hash}, {limit:1}).next().then(function(x){
      if (!x)
        throw `Failed to locate file in gridFS: ${hash}`;
      var input = bucket.openDownloadStream(x['_id']);
      return archive.append(input, { name: filename, date: date });
    });
  });
  return Promise.allSettled(promises).then(async function(){
    for (const [path, files] of Object.entries(indexes)) {
      var packages = files.map(doc_to_dcf).join('');
      await archive.append(packages, { name: `${path}/PACKAGES` });
      await archive.append(zlib.gzipSync(packages), { name: `${path}/PACKAGES.gz` });
    }
    archive.finalize();
    return files;
  });
}

router.get('/:user/api/snapshot/:format?', function(req, res, next) {
  var user = req.params.user;
  var query = {_user: user, _type: {'$ne' : 'failure'}};
  if(req.query.types)
    query._type = {'$in' : req.query.types.split(",")};
  if(req.query.packages)
    query.Package = {'$in' : req.query.packages.split(",")};
  var cursor = packages.find(query).project(pkgfields).sort({"Package" : 1});
  cursor.toArray().then(function(files){
    if(!files.length)
      throw "Query returned no packages";
    if(req.query.binaries){
      var allowed = req.query.binaries.split(",");
      files = files.filter(function(doc){
        var binver = doc.Built && doc.Built.R || "";
        return doc._type == 'src' || allowed.find(ver => binver.startsWith(ver));
      });
    }
    var format = req.query.format || "zip";
    var archive = new_zipfile(format);
    if(format == 'zip'){
      res.type('application/zip').attachment(`${user}-snapshot.zip`)
    } else if(format == 'tar') {
      res.type('application/gzip').attachment(`${user}-snapshot.tar.gz`)
    } else {
      throw "Unsupported snapshot format: " + format;
    }
    archive.pipe(res);
    packages_snapshot(files, archive);
  }).catch(error_cb(400, next));
});

module.exports = router;
