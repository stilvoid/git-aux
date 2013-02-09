#!/usr/bin/env node

var exec = require("child_process").exec;
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

function add(git_root, config, files) {
    files.forEach(function(file) {
        var relative_path = path.resolve(process.cwd(), file);

        // FIXME: Make this a recursive copy

        if(new RegExp("^" + config.basedir + path.sep).test(relative_path)) {
            relative_path = path.relative(config.basedir, relative_path);

            debug("Adding:", relative_path);

            mkdir(path.dirname(path.join(git_root, relative_path))).then(function() {
                var is = fs.createReadStream(path.join(config.basedir, relative_path));
                os = fs.createWriteStream(path.join(git_root, relative_path));

                util.pump(is, os, function(err) {
                    if(err) {
                        die("Failed copying file", err);
                    }

                    exec("git add " + path.join(git_root, relative_path), function(err) {
                        if(err) {
                            die("Failed adding file to git", err);
                        }
                    });
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

        files.forEach(function(file) {
            fs.stat(path.join(dir, file), function(err, stats) {
                if(err) {
                    die("Failed getting file info", err);
                }

                if(stats.isFile()) {
                    count--;

                    output.push(path.join(dir, file));

                    if(count === 0) {
                        console.log("File");
                        promise.fulfill(output);
                    }
                } else if(stats.isDirectory()) {
                    get_files(path.join(dir, file)).then(function(sub_dir) {
                        //output = output.concat(sub_dir);

                        output.push(sub_dir);

                        count--;

                        if(count === 0) {
                            promise.fulfill(output);
                        }
                    });
                } else {
                    count--;

                    if(count === 0) {
                        console.log("Bum");
                        promise.fulfill(output);
                    }
                }
            });
        });
    });

    return promise;
}

get_files("/home/steve/code/git-aux").then(function(files) {
    console.log(files);
});

function sync(git_root, config) {
    // First stash
    exec("git stash", function(err) {
        var count;

        if(err) {
            die("Failed to stash", err);
        }
    });

    // Get file list

    // Stash pop

    // Copy contents from basedir
}

// Check the parameters

if(process.argv.length < 3) {
    help();
    process.exit();
}

// Get the config
/*
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
        } else if(command === "apply") {
        } else {
            console.log("unknown command:", command);
            help();
            process.exit(1);
        }
    });
});
*/
