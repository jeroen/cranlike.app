/* dummy token for GH api limits */
const token = Buffer.from('Z2hwX2IxR2RLZGN0cEZGSXZYSHUyWnlpZ0dXNmxGcHNzbTBxNGJ0Vg==', 'base64').toString();

function fetch_text(url, opt = {}){
  return fetch(url, opt).then(function(response){
    if (!response.ok) {
      response.message = "fetch_text error: http " + response.status;
      return Promise.reject(response);
    }
    return response.text();
  });
}

function fetch_github(url, opt = {}){
  opt.headers = opt.headers || {'Authorization': 'token ' + token};
  return fetch(url, opt).then(function(response){
    return response.json().then(function(data){
      if (!response.ok) {
        throw "GitHub API returned HTTP " + response.status + ": " + (data.message || data);
      }
      return data;
    });
  });
}

/* true if we either have packages in the db, or an upstream monorepo exists */
function test_if_universe_exists(user){
  if(user === ':any') return Promise.resolve(true);
  const url = 'https://github.com/r-universe/' + user;
  const query = {'$or': [
    {'_user': user},
    {'_builder.maintainer.login': user, '_selfowned': true}
  ]};
  return packages.findOne(query).then(function(x){
    if(x) return true;
    console.log("Testing if " + url + " exists...");
    return fetch(url).then(response => response.ok);
  });
}

function get_registry_info(user){
  const url = 'https://api.github.com/repos/r-universe/' + user + '/actions/workflows/sync.yml/runs?per_page=1&status=completed';
  return fetch_github(url);
}

function get_submodule_hash(user, submodule){
  const url = `https://api.github.com/repos/r-universe/${user}/git/trees/HEAD`
  return fetch_github(url).then(function(data){
    var info = data.tree.find(file => file.path == submodule);
    if(info && info.sha){
      return info.sha;
    }
  });
}

function trigger_rebuild(run_path){
  const rebuild_token = process.env.REBUILD_TOKEN;
  if(!rebuild_token)
    throw "No rebuild_token available";
  const url = `https://api.github.com/repos/${run_path}/rerun-failed-jobs`;
  return fetch_github(url, {
    method: 'POST',
    headers: {'Authorization': 'token ' + rebuild_token}
  });
}

function parse_description(desc){
  var fields = desc.replace(/\n[\t ]+/g, ' ').split("\n")
  var version = fields.find(x => x.match(/^Version:/i));
  var date = fields.find(x => x.match(/^Date\/Publication:/i));
  var urls = fields.find(x => x.match(/^URL:/i));
  var bugreports = fields.find(x => x.match(/^BugReports:/i));
  var strings = `${urls} ${bugreports}`.trim().split(/[,\s]+/);
  var urlarray = strings.filter(x => x.match("https?://.*(github|gitlab|bitbucket)")).map(x => x.replace('http://', 'https://'));
  return {
    version: version ? version.substring(9) : "parse failure",
    date: date ? date.substring(18) : "parse failure",
    urls: [...new Set(urlarray.map(x => x.replace(/\/issues$/, "")))]
  }
}

function get_cran_desc(package){
  // try both mirros in case one is down/syncing
  var url1 = `https://cloud.r-project.org/web/packages/${package}/DESCRIPTION`;
  var url2 = `http://cran.r-project.org/web/packages/${package}/DESCRIPTION`;
  return fetch_text(url1).then(function(res){
    return parse_description(res);
  }).catch(function(err){
    return fetch_text(url2).then(function(res2){
      return parse_description(res2);
    });
  }).catch(function(err){
    var url3 = `https://cloud.r-project.org/src/contrib/Archive/${package}/`;
    return fetch(url3).then(function(response){
      if(response.ok){
        return {version: "archived"};
      }
      if(response.status == 404){
        return {version: null};
      }
      throw "Failed to lookup CRAN version";
    });
  });
}

module.exports = {
  test_if_universe_exists : test_if_universe_exists,
  get_registry_info : get_registry_info,
  get_submodule_hash : get_submodule_hash,
  trigger_rebuild : trigger_rebuild,
  get_cran_desc : get_cran_desc
};

/* Tests
get_cran_desc("curl").then(console.log)
get_cran_desc("Ohmage").then(console.log)
get_cran_desc("doesnotexists").then(console.log)
fetch_github('https://api.github.com/users/jeroedfsdffdsn').catch(console.log)
get_registry_info("jeroen").then(console.log)
get_submodule_hash("jeroen", "curl").then(console.log)
*/