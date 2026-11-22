class HeavyList {
    constructor(list) {
        this._stopped = false;
        this._started = false;
        this._finished = false;
        this._registered = [];
        this._list = list;
        this.index = -1;
        HeavyList._keys++;
        this._group = Resume._keys.toString();
        this.length = this._list.length;
    }

    addItemAt(item, index) {
        this._list[index] = item;
    }

    addItem(item) {
        this._list.push(item);
        this.length += 1;
    }

    addItemLoop(item) {
        this._list.push(item);
        this.length += 1;
        if (this._finished) {
            this._stopped = this._finished = false;
            if (this.index >= 0) this.index--;
            this.loop(this._time, this._completed, this._each);
        }
    }

    removeItem(item) {
        const index = this._list.indexOf(item);
        if (index >= 0) {
            this._list.splice(index, 1);
            this.length--;
        }
    }

    onClear() {
        this._list = [];
    }

    loop(time, completed, each) {
        this._time = time;
        this._completed = completed;
        this._each = each;
        const that = this;

        const resume = new Resume(() => {
            that.t = setTimeout(() => {
                loopStep();
            }, time);
        }, this._group);

        const loopStep = () => {
            if (that._list.length > 0) that.index += 1;
            if (that.index < that.length && that._list.length > 0) {
                that._registered.push(that._list[that.index]);
            }
            that._started = true;
            if (that.index === that.length || that._list.length === 0) {
                that._finished = true;
            }
            if (that._list.length > 0) {
                that.index === that.length ? completed(that._list) : each(that._list[that.index], resume.callback);
            }
        };

        if (!this._stopped) resume.call();
    }

    empty() {
        this.stop();
        this._list = [];
        this.index = -1;
        this.length = 0;
        setTimeout(() => {
            this._stopped = false;
        }, 0);
    }

    reset() {
        Resume.clear(this._group);
        this._stopped = this._started = false;
        if (this.t != null) clearTimeout(this.t);
    }

    isFinished() {
        return this._finished;
    }

    stop() {
        Resume.clear(this._group);
        this._started = false;
        this._stopped = true;
        if (this.t != null) clearTimeout(this.t);
    }

    pause() {
        if (!this._stopped) {
            this.stop();
            this._started = false;
            this.clearRegistered();
        }
        return this._list;
    }

    clearRegistered() {
        this._registered.forEach((item) => {
            const index = this._list.indexOf(item);
            if (index !== -1) this._list.splice(index, 1);
        });
        this._registered = [];
        this.index = -1;
        this.length = this._list.length;
    }

    getList() {
        return this._list;
    }

    getSize() {
        return this._list.length;
    }
}
HeavyList._keys = -1000000;

class Resume {
    constructor(callback, group) {
        Resume._keys++;
        this._key = Resume._keys.toString();
        this._group = group;
        if (!Resume._callbacks[this._group]) {
            Resume._callbacks[this._group] = {};
        }
        Resume._callbacks[this._group][this._key] = callback;
    }

    static clear(group) {
        if (!Resume._callbacks[group]) {
            Resume._callbacks[group] = {};
        } else {
            delete Resume._callbacks[group];
        }
    }

    call() {
        if (Resume._callbacks[this._group] && Resume._callbacks[this._group][this._key]) {
            Resume._callbacks[this._group][this._key]();
        }
    }

    get callback() {
        return (Resume._callbacks[this._group] && Resume._callbacks[this._group][this._key])
            ? Resume._callbacks[this._group][this._key]
            : () => {};
    }
}
Resume._callbacks = {};
Resume._keys = -1000000;

module.exports = { HeavyList, Resume };
