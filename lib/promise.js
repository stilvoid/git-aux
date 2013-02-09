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

module.exports = Promise;
