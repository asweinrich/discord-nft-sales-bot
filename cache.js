export function get(key) {
    return this.cache[key]
}

export function set(key, val) {
    this.cache[key] = val
}
