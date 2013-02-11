var path = require("path");
var fs = require("fs");
var util = require("util");

var Promise = require("./promise");
var log = require("./log");

function mkdir(dir) {
    var promise = new Promise();

    log.debug("Making dir:", dir);

    fs.mkdir(dir, function(err) {
        if(err) {
            if(err.code === "ENOENT") {
                mkdir(path.dirname(dir)).then(function() {
                    mkdir(dir).then(promise.fulfill);
                });
            } else if(err.code === "EEXIST") {
                promise.fulfill();
            } else {
                log.die("Error creating directory", err);
            }
        } else {
            promise.fulfill();
        }
    });

    return promise;
}

function rm(file) {
    var promise = new Promise();

    fs.stat(file, function(err, stats) {
        if(err) {
            if(err.code === "ENOENT") {
                return promise.fulfill();
            } else {
                log.die("Unable to stat file", err);
            }   
        }

        if(stats.isDirectory()) {
            fs.readdir(file, function(err, files) {
                var count = files.length;

                function finish() {
                    fs.rmdir(file, function(err) {
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
                        rm(path.join(file, f)).then(function() {
                            count--;

                            if(count === 0) {
                                finish();
                            }
                        });
                    });
                }
            });
        } else {
            fs.unlink(file, function(err) {
                if(err) {
                    log.die("Unable to delete file", err);
                }

                promise.fulfill();
            });
        }
    });

    return promise;
}

function copy(src, dest) {
    var promise = new Promise();

    rm(dest).then(function() {
        fs.stat(src, function(err, stats) {
            var is, os;

            if(err) {
                if(err.code === "ENOENT") {
                    promise.fulfill();
                } else {
                    log.die("Unable to stat file", err);
                }
            }

            if(stats.isDirectory()) {
                fs.mkdir(dest, function(err) {
                    if(err) {
                        log.die("Unable to create directory", err);
                    }

                    fs.readdir(src, function(err, files) {
                        var count = files.length;

                        if(count === 0) {
                            promise.fulfill();
                        }

                        files.forEach(function(file) {
                            copy(path.join(src, file), path.join(dest, file)).then(function() {
                                count--;

                                if(count === 0) {
                                    promise.fulfill();
                                }
                            });
                        });
                    });
                });
            } else {
                is = fs.createReadStream(src);
                os = fs.createWriteStream(dest);

                util.pump(is, os, function(err) {
                    if(err) {
                        log.die("Failed copying file", err);
                    }

                    promise.fulfill();
                });
            }
        });
    });

    return promise;
}

function get_files(dir) {
    var promise = new Promise();

    var count = 0;

    var output = [];

    fs.readdir(dir, function(err, files) {
        if(err) {
            log.die("Error reading dir", err);
        }

        count = files.length;

        if(count === 0) {
            promise.fulfill(output);
        }

        files.forEach(function(file) {
            fs.stat(path.join(dir, file), function(err, stats) {
                if(err) {
                    log.die("Failed getting file info", err);
                }

                if(stats.isFile()) {
                    count--;

                    output.push(path.join(dir, file));

                    if(count === 0) {
                        promise.fulfill(output);
                    }
                } else if(stats.isDirectory()) {
                    get_files(path.join(dir, file)).then(function(sub_dir) {
                        count--;

                        output = output.concat(sub_dir);

                        if(count === 0) {
                            promise.fulfill(output);
                        }
                    });
                } else {
                    count--;

                    if(count === 0) {
                        promise.fulfill(output);
                    }
                }
            });
        });
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

exports.mkdir = mkdir;
exports.rm = rm;
exports.copy = copy;
exports.get_files = get_files;
exports.walk = walk;
