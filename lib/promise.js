// VERY naive promise implementation

function Promise() {
    var callbacks = [];

    var fulfilled = false;
    var result;

    this.then = function(new_callbacks) {
        if(!Array.isArray(new_callbacks)) {
            new_callback = [new_callbacks];
        }

        callbacks = callbacks.concat(new_callbacks);

        if(fulfilled) {
            // Call fulfill again
            this.fulfill();
        }

        return this;
    };

    this.fulfill = function() {
        var callback, callback_result;

        if(!fulfilled) {
            result = Array.prototype.slice.call(arguments, 0);
        }

        fulfilled = true;

        while(callbacks.length > 0) {
            callback = callbacks.shift();

            callback_result = callback.apply(this, result);

            if(callback_result instanceof Promise) {
                callback_result.then(callbacks.splice(0));
            } else {
                result = [callback_result];
            }
        }
    };
}

Promise.wrap = function(func) {
    var args = Array.prototype.slice.call(arguments, 1);

    var promise = new Promise();

    args.push(promise.fulfill);

    promise.return_value = func.apply(this, args);

    return promise;
};

Promise.require = function(name) {
    var mod = require(name);
    var prop;

    for(prop in mod) {
        if(mod.hasOwnProperty(prop) && typeof(mod[prop]) === "function" && !/^[A-Z]/.test(prop)) {
            prop[mod] = Promise.wrap(prop[mod]);
        }
    }

    return mod;
};

module.exports = Promise;
