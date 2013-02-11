var DEBUG = false;

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

exports.debug = debug;
exports.die = die;
