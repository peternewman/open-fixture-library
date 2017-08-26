module.exports = [{
  name: 'Duplicate channel names',
  order: 95,
  hasFeature: fixture => {
    const names = fixture.availableChannels.map(ch => ch.name).concat(fixture.matrixChannels.map(ch => ch.wrappedChannel.name));
    return names.some((name, pos) => names.indexOf(name) !== pos);
  }
}];