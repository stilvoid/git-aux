var path = require("path");
var fs = require("fs");
var util = require("util");

var Promise = require("./promise");
var log = require("./log");

// Equivalent of mkdir -p
function mkdir_p(dir) {
    var promise = new Promise();

    log.debug("Making dir:", dir);
    
    Promise.wrap(fs.mkdir, dir).then(function(err) {
        if(err) {
            if(err.code === "ENOENT") {
                // Parent doesn't exist, make it
                mkdir(path.dirname(dir)).then(function() {
                    mkdir(dir).then(promise.fulfill);
                });
            } else if(err.code === "EEXIST") {
                // Already exists, job done
                promise.fulfill();
            } else {
                log.die("Error creating directory", err);
            }
        } else {
            // Created OK
            promise.fulfill();
        }
    });

    return promise;
}

// Equivalent of rm -r
function rm_r(file) {
    var promise = new Promise();

    Promise.wrap(fs.stat, file).then(function(err, stats) {
        if(err) {
            if(err.code === "ENOENT") {
                // Already deleted, job done
                promise.fulfill();
            } else {
                log.die("Unable to stat file", err);
            }
        } else {
            if(stats.isDirectory()) {
                Promise.wrap(fs.readdir, file).then(function(err, files) {
                    var count = files.length;

                    function finish() {
                        Promise.wrap(fs.rmdir, file).then(function(err) {
                            if(err) {
                                log.die("Unable to remove dir", err);
                            }

                            promise.fulfill();
                        });
                    }

                    if(count === 0) {
                        finish();
                    } else {
                        files.forEach(function(f) {
                            rm_r(path.join(file, f)).then(function() {
                                count--;

                                if(count === 0) {
                                    finish();
                                }
                            });
                        });
                    }
                });
            } else {
                Promise.wrap(fs.unlink, file).then(function(err) {
                    if(err) {
                        log.die("Unable to delete file", err);
                    }

                    promise.fulfill();
                });
            }
        }
    });

    return promise;
}

// Equivalent of cp -a
function cp_a(src, dest) {
    var promise = new Promise();

    mkdir_p(path.dirname(dest)).then(function() {
        return rm_r(dest);
    }).then(function() {
        return Promise.wrap(fs.stat, src);
    }).then(function(err, stats) {
        if(stats.isDirectory()) {
            Promise.wrap(fs.readdir, src).then(function(err, files) {
                var count = files.length;

                if(count === 0) {
                    promise.fulfill();
                } else {
                    files.forEach(function(file) {
                        cp_a(path.join(src, file), path.join(dest, file)).then(function() {
                            if(--count === 0) {
                                promise.fulfill();
                            }
                        });
                    });
                }
            });
        } else {
            var is = fs.createReadStream(src);
            var os = fs.createWriteStream(dest);

            Promise.wrap(util.pump, is, os).then(function(err) {
                 if(err) {
                    log.die("Failed copying file", err);
                    log.die("Unable to delete file", err);
                 }

                 promise.fulfill();
            });
        }
    });

    return promise;
}

function walk(p, callback) {
    var promise = new Promise();

    fs.stat(p, function(err, stats) {
        if(err) {
            log.die("Failed to stat file", err);
        }

        if(stats.isDirectory()) {
            fs.readdir(p, function(err, files) {
                if(err) {
                    log.die("Couldn't read dir", err);
                }

                var count = files.length;

                if(count === 0) {
                    callback(p, stats).then(promise.fulfill);
                }

                files.forEach(function(file) {
                    walk(path.join(p, file), callback).then(function() {
                        count--;

                        if(count === 0) {
                            callback(p, stats).then(promise.fulfill);
                        }
                    });
                });
            });
        } else {
            callback(p, stats).then(promise.fulfill);
        }
    });

    return promise;
}

function get_files(dir) {
    var promise = new Promise();

    var files = [];

    walk(dir, function(p, stats) {
        var promise = new Promise();

        if(!stats.isDirectory()) {
            files.push(p);
        }

        promise.fulfill();

        return promise;
    }).then(function() {
        promise.fulfill(files);
    });

    return promise;
}

exports.mkdir_p = mkdir_p;
exports.rm_r = rm_r;
exports.cp_a = cp_a;
exports.walk = walk;
exports.get_files = get_files;
