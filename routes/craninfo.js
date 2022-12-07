var express = require('express');
var createError = require('http-errors');
var router = express.Router();
var tools = require("../src/tools.js");

function error_cb(status, next) {
  return function(err){
    console.log("[Debug] HTTP " + status + ": " + err)
    next(createError(status, err));
  }
}

router.get('/:user/craninfo', function(req, res, next) {
  var packages = req.query.package.split(",").map(e => e.trim()).filter(e => e.length);
  tools.get_cran_info(packages, req.query.url).then(function(info){
    console.log(`Length: ${info.lenght}`)
    res.send(info.length == 1 ? info[0] : info); //temporary unbox
  }).catch(error_cb(400, next));
});

module.exports = router;
