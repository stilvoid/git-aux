#!/usr/bin/env node

var exec = require("child_process").exec;
var spawn = require("child_process").spawn;
var path = require("path");
var fs = require("fs");
var util = require("util");

var fsutil = require("./lib/fsutil");
var Promise = require("./lib/promise");

var DEBUG = false;

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

function add(git_root, config, files) {
    files.forEach(function(file) {
        var relative_path = path.resolve(process.cwd(), file);

        if(new RegExp("^" + config.basedir + path.sep).test(relative_path)) {
            relative_path = path.relative(config.basedir, relative_path);

            debug("Adding:", relative_path);

            fsutil.copy(path.join(config.basedir, relative_path), path.join(git_root, relative_path)).then(function() {
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

function sync(git_root, config) {
    fsutil.get_files(git_root).then(function(files) {
        var count;

        files = files.filter(function(f) {
            return !new RegExp("^" + path.join(git_root, ".git")).test(f);
        });

        count = files.length;

        function finish() {
            // Remove empty dirs
            fsutil.walk(git_root, function(f, stats) {
                var promise = new Promise();

                if(!new RegExp("^" + path.join(git_root, ".git")).test(f)
                &&
                stats.isDirectory()) {
                    fs.readdir(f, function(err, files) {
                        if(files.length === 0) {
                            fs.rmdir(f, function(err) {
                                if(err) {
                                    die("Unable to rmdir", err);
                                }

                                promise.fulfill();
                            });
                        } else {
                            promise.fulfill();
                        }
                    });
                } else {
                    promise.fulfill();
                }

                return promise;
            }).then(function() {
                spawn("git", ["add", "-p"], {stdio: "inherit"});
            });
        }

        if(count === 0) {
            finish();
        }

        files.forEach(function(file) {
            debug("Syncing: " + file);

            file = path.relative(git_root, file);

            fs.exists(path.join(config.basedir, file), function(exists) {
                if(exists) {
                    fsutil.copy(path.join(config.basedir, file), path.join(git_root, file)).then(function() {
                        count--;

                        if(count === 0) {
                            finish();
                        }
                    });
                } else {
                    fsutil.rm(path.join(git_root, file)).then(function() {
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
    exec("git stash -u", function(err, stdout) {
        var stashed = !/^No local changes/.test(stdout);

        if(err) {
            die("Unable to stash", err);
        }

        fs.readdir(git_root, function(err, files) {
            var count = files.length - 1;

            function finish() {
                if(stashed) {
                    exec("git stash pop");
                }
            }

            if(count === 0) {
                finish();
            }

            files.forEach(function(file) {
                if(file !== ".git") {
                    debug("Syncing: " + file);

                    file = path.relative(git_root, path.join(git_root, file));

                    fsutil.copy(path.join(git_root, file), path.join(config.basedir, file)).then(function() {
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
