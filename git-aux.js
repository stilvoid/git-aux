#!/usr/bin/env node

var exec = require("child_process").exec;
var spawn = require("child_process").spawn;
var path = require("path");
var fs = require("fs");
var util = require("util");

var fsutil = require("./lib/fsutil");
var log = require("./lib/log");
var Promise = require("./lib/promise");

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
            log.debug("No config");
        } else {
            try {
                data = JSON.parse(data);
                promise.fulfill(data);
            } catch(e) {
                log.die("Unable to parse git aux config", e);
            }
        }
    });

    return promise;
}

function save_config(git_root, config) {
    var promise = new Promise();

    fs.writeFile(path.join(git_root, ".git", "aux", "config.json"), JSON.stringify(config, null, 2), function(err) {
        if(err) {
            log.die("Unable to save config", err);
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
            log.die("Couldn't create git aux directory", err);
        }

        save_config(git_root, {
            basedir: path.resolve(process.cwd(), basedir)
        }).then(function() {
            console.log("Initialised git aux repository");
        });
    });
}

function add(git_root, config, files) {
    var count = files.length;

    files.forEach(function(file) {
        var relative_path = path.resolve(process.cwd(), file);

        if(new RegExp("^" + config.basedir + path.sep).test(relative_path)) {
            relative_path = path.relative(config.basedir, relative_path);

            log.debug("Adding:", relative_path);

            fsutil.cp_a(path.join(config.basedir, relative_path), path.join(git_root, relative_path)).then(function() {
                exec("git add " + path.join(git_root, relative_path), function(err) {
                    if(err) {
                        log.die("Failed adding file to git", err);
                    }

                    count--;

                    if(count === 0) {
                        spawn("git", ["status"], {stdio: "inherit"});
                    }
                });
            });
        } else {
            log.die(file + " is not within this git aux repo's basedir (" + config.basedir + ")");
        }
    });
}

function sync(git_root, config, force) {
    var outer_promise = new Promise();

    var stashed;

    Promise.wrap(exec, "git stash -u").then(function(err, stdout) {
        stashed = !/^No local changes/.test(stdout);

        return fsutil.get_files(git_root);
    }).then(function(files) {
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
                                    log.die("Unable to rmdir", err);
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
                var git_add;

                function finish() {
                    Promise.wrap(exec, "git add $(git ls-files -o --exclude-standard)").then(function() {
                        return Promise.wrap(exec, "git checkout $(git ls-files --exclude-standard)");
                    }).then(function() {
                        if(stashed) {
                            Promise.wrap(exec, "git stash pop").then(outer_promise.fulfill);
                        } else {
                            outer_promise.fulfill();
                        }
                    });
                }

                if(!force) {
                    spawn("git", ["add", "-p"], {stdio: "inherit"}).on("exit", finish);
                } else {
                    Promise.wrap(exec, "git add -u").then(finish);
                }
            });
        }

        if(count === 0) {
            finish();
        }

        files.forEach(function(file) {
            log.debug("Syncing: " + file);

            file = path.relative(git_root, file);

            fs.exists(path.join(config.basedir, file), function(exists) {
                if(exists) {
                    fsutil.cp_a(path.join(config.basedir, file), path.join(git_root, file)).then(function() {
                        count--;

                        if(count === 0) {
                            finish();
                        }
                    });
                } else {
                    fsutil.rm_r(path.join(git_root, file)).then(function() {
                        count--;

                        if(count === 0) {
                            finish();
                        }
                    });
                }
            });

        });
    });

    return outer_promise;
}

function apply(git_root, config) {
    var stashed;

    Promise.wrap(exec, "git stash -u").then(function(err, stdout) {
        var current_branch, temp_branch, commit;

        stashed = !/^No local changes/.test(stdout);

        if(err) {
            log.die("Unable to stash", err);
        }

        // Get current branch
        return Promise.wrap(exec, "git branch");
    }).then(function(err, stdout) {
        current_branch = /^\*\s+(.*$)/m.exec(stdout)[1];

        temp_branch = "git-aux-temp" + (new String(Math.random()).replace(/^0\./, ""));

        return Promise.wrap(exec, "git checkout -b " + temp_branch);
    }).then(function(err) {
        return sync(git_root, config, true);
    }).then(function() {
        return Promise.wrap(exec, "git commit -a -m 'Temp'");
    }).then(function(err) {
        return Promise.wrap(exec, "git show");
    }).then(function(err, stdout) {
        commit = /^commit\s+(.+)$/m.exec(stdout)[1];
    }).then(function(err) {
        return Promise.wrap(exec, "git reset --hard " + current_branch);
    }).then(function(err) {
        return Promise.wrap(exec, "git reset " + commit);
    }).then(function(err) {
        var promise = new Promise();
        var git_add = spawn("git", ["add", "-p"], {stdio: "inherit"});

        git_add.on("exit", function() {
            Promise.wrap(exec, "git add $(git ls-files -o --exclude-standard)").then(promise.fulfill);
        });

        return promise;
    }).then(function() {
        return Promise.wrap(exec, "git commit -m 'Temp 2'");
    }).then(function(err) {
        return Promise.wrap(exec, "git reset --hard HEAD");
    }).then(function() {
        // Copy the files across

        Promise.wrap(fs.readdir, git_root).then(function(err, files) {
            var count;

            files = files.filter(function(f) {
                return !/^\.git/.test(f);
            });

            count = files.length;

            function finish() {
                Promise.wrap(exec, "git checkout " + current_branch).then(function() {
                    return Promise.wrap(exec, "git branch -D " + temp_branch);
                }).then(function() {
                    if(stashed) {
                        return Promise.wrap(exec, "git stash pop");
                    } else {
                        return null;
                    }
                }).then(function() {
                    console.log("Done");
                });
            }

            if(count === 0) {
                finish();
            }

            files.forEach(function(file) {
                log.debug("Applying: " + file);

                fsutil.cp_a(path.join(git_root, file), path.join(config.basedir, file)).then(function() {
                    count--;

                    if(count === 0) {
                        finish();
                    }
                });
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

        log.debug("Config:", config);

        log.debug("Command:", command);
        log.debug("Args:", args);

        if(!config && command !== "init") {
            log.die("Not a git aux repository");
        }

        if(command === "init") {
            if(config) {
                log.die("Already a git aux repository");
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

            sync(git_root, config).then(function() {
                spawn("git", ["status"], {stdio: "inherit"});
            });
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
