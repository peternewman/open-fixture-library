module.exports = class MatrixChannel {
  /**
   * Create a MatrixChannel instance that wraps the given channel and holds the pixelKey and XYZ position data.
   * @param {!AbstractChannel} wrappedChannel
   * @param {!string} pixelKey
   */
  constructor(wrappedChannel, pixelKey) {
    this._wrappedChannel = wrappedChannel;
    this._pixelKey = pixelKey;
    this._cache = {};
  }

  /**
   * @return {!string} The key of the wrapped channel.
   */
  get key() {
    return this._wrappedChannel.key;
  }

  /**
   * @return {!AbstractChannel} The wrapped channel.
   */
  get wrappedChannel() {
    return this._wrappedChannel;
  }

  /**
   * @return {!string} The pixelKey or pixelGroupKey of this channel.
   */
  get pixelKey() {
    return this._pixelKey;
  }

  /**
   * @return {?number[]} The XYZ position of this pixel as an numeric array. Null if this is a pixelGroupKey.
   */
  get position() {
    return this._wrappedChannel.fixture.matrix.pixelKeyPositions[this._pixelKey] || null;
  }
};