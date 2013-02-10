#!/usr/bin/env node

var exec = require("child_process").exec;
var spawn = require("child_process").spawn;
var path = require("path");
var fs = require("fs");
var util = require("util");

var Promise = require("./lib/promise");

var DEBUG = true;

// Some standard helpers

function debug() {
    var args;
    if(DEBUG) {
        args = Array.prototype.slice.call(arguments, 0);
        args.unshift("DEBUG:");

        console.log.apply(this, args);
    }
}

function die(message, exception) {
    if(exception) {
        message += ": " + exception.message;
    }

    console.log(message);

    if(DEBUG) {
        throw exception;
    }

    process.exit(1);
}

function help() {
    console.log("usage: git aux <command> [<args>]");
    console.log();
    console.log("Commands:");
    console.log("init <basedir>   Initialise git aux to use the chosen directory");
    console.log("add <file(s)>    Add the chosen file (from basedir) to the repository");
    console.log("sync             Import changes to tracked files in basedir into the repository");
    console.log("apply            Apply changes from the repository into the basedir");
    console.log();
}

function get_git_root() {
    var promise = new Promise();

    exec("git rev-parse --show-toplevel", function(err, stdout, stderr) {
        if(err) {
            console.log("Not a git repository");
            process.exit(1);
        }

        home = stdout.trim();

        promise.fulfill(home);
    });

    return promise;
}

function get_config(git_root) {
    var promise = new Promise();

    fs.readFile(path.join(git_root, ".git", "aux", "config.json"), "utf8", function(err, data) {
        if(err) {
            promise.fulfill(null);
            debug("No config");
        } else {
            try {
                data = JSON.parse(data);
                promise.fulfill(data);
            } catch(e) {
                die("Unable to parse git aux config", e);
            }
        }
    });

    return promise;
}

function save_config(git_root, config) {
    var promise = new Promise();

    fs.writeFile(path.join(git_root, ".git", "aux", "config.json"), JSON.stringify(config, null, 2), function(err) {
        if(err) {
            die("Unable to save config", err);
        }

        promise.fulfill();
    });

    return promise;
}

function mkdir(dir) {
    var promise = new Promise();

    debug("Making dir:", dir);

    fs.mkdir(dir, function(err) {
        if(err) {
            if(err.code === "ENOENT") {
                mkdir(path.dirname(dir)).then(function() {
                    mkdir(dir).then(promise.fulfill);
                });
            } else if(err.code === "EEXIST") {
                promise.fulfill();
            } else {
                die("Error creating directory", err);
            }
        } else {
            promise.fulfill();
        }
    });

    return promise;
}

// Git aux commands

function init(git_root, basedir) {
    // Make git aux directory
    fs.mkdir(path.join(git_root, ".git", "aux"), function(err) {
        if(err) {
            die("Couldn't create git aux directory", err);
        }

        save_config(git_root, {
            basedir: path.resolve(process.cwd(), basedir)
        }).then(function() {
            console.log("Initialised git aux repository");
        });
    });
}

function rm(file) {
    var promise = new Promise();

    fs.stat(file, function(err, stats) {
        if(err) {
            if(err.code === "ENOENT") {
                return promise.fulfill();
            } else {
                die("Unable to stat file", err);
            }   
        }

        if(stats.isDirectory()) {
            fs.readdir(file, function(err, files) {
                var count = files.length;

                function finish() {
                    fs.rmdir(file, function(err) {
                        if(err) {
                            die("Unable to remove dir", err);
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
                    die("Unable to delete file", err);
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
                    die("Unable to stat file", err);
                }
            }

            if(stats.isDirectory()) {
                fs.mkdir(dest, function(err) {
                    if(err) {
                        die("Unable to create directory", err);
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
                        die("Failed copying file", err);
                    }

                    promise.fulfill();
                });
            }
        });
    });

    return promise;
}

function add(git_root, config, files) {
    files.forEach(function(file) {
        var relative_path = path.resolve(process.cwd(), file);

        // FIXME: Make this a recursive copy

        if(new RegExp("^" + config.basedir + path.sep).test(relative_path)) {
            relative_path = path.relative(config.basedir, relative_path);

            debug("Adding:", relative_path);

            copy(path.join(config.basedir, relative_path), path.join(git_root, relative_path)).then(function() {
                exec("git add " + path.join(git_root, relative_path), function(err) {
                    if(err) {
                        die("Failed adding file to git", err);
                    }
                });
            });
        } else {
            die(file + " is not within this git aux repo's basedir (" + config.basedir + ")");
        }
    });
}

function get_files(dir) {
    var promise = new Promise();

    var count = 0;

    var output = [];

    fs.readdir(dir, function(err, files) {
        if(err) {
            die("Error reading dir", err);
        }

        count = files.length;

        if(count === 0) {
            promise.fulfill(output);
        }

        files.forEach(function(file) {
            fs.stat(path.join(dir, file), function(err, stats) {
                if(err) {
                    die("Failed getting file info", err);
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

get_files("/home/steve/code/git-aux/test/repo").then(function(files) {
    console.log(files);
});

function sync(git_root, config) {
    get_files(git_root).then(function(files) {
        var count;

        files = files.filter(function(f) {
            return !new RegExp("^" + path.join(git_root, ".git")).test(f);
        });

        count = files.length;

        function finish() {
            spawn("git", ["add", "-p"], {stdio: "inherit"});
        }

        if(count === 0) {
            finish();
        }

        files.forEach(function(file) {
            debug("Syncing: " + file);

            file = path.relative(git_root, file);

            fs.exists(path.join(config.basedir, file), function(exists) {
                if(exists) {
                    copy(path.join(config.basedir, file), path.join(git_root, file)).then(function() {
                        count--;

                        if(count === 0) {
                            finish();
                        }
                    });
                } else {
                    rm(path.join(git_root, file)).then(function() {
                        count--;

                        if(count === 0) {
                            finish();
                        }
                    });
                }
            });

        });
    });
}

function apply(git_root, config) {
    exec("git stash", function(err) {
        if(err) {
            die("Unable to stash", err);
        }

        fs.readdir(git_root, function(err, files) {
            var count = files.length - 1;

            function finish() {
                exec("git stash pop");
            }

            if(count === 0) {
                finish();
            }

            files.forEach(function(file) {
                if(file !== ".git") {
                    debug("Syncing: " + file);

                    file = path.relative(git_root, path.join(git_root, file));

                    copy(path.join(config.basedir, file), path.join(git_root, file)).then(function() {
                        count--;

                        if(count === 0) {
                            finish();
                        }
                    });
                }
            });
        });
    });
}

// Check the parameters

if(process.argv.length < 3) {
    help();
    process.exit();
}

// Get the config
get_git_root().then(function(git_root) {
    get_config(git_root).then(function(config) {
        var command = process.argv[2];
        var args = process.argv.slice(3);

        debug("Config:", config);

        debug("Command:", command);
        debug("Args:", args);

        if(!config && command !== "init") {
            die("Not a git aux repository");
        }

        if(command === "init") {
            if(config) {
                die("Already a git aux repository");
            }

            if(args.length !== 1) {
                help();
                process.exit(1);
            }

            init(git_root, args[0]);
        } else if(command === "add") {
            if(args.length === 0) {
                help();
                process.exit(1);
            }

            add(git_root, config, args);
        } else if(command === "sync") {
            if(args.length !== 0) {
                help();
                process.exit(1);
            }

            sync(git_root, config);
        } else if(command === "apply") {
            if(args.length !== 0) {
                help();
                process.exit(1);
            }

            apply(git_root, config);
        } else {
            console.log("unknown command:", command);
            help();
            process.exit(1);
        }
    });
});
