export function addSubScription(subscriptions, callback) {
  subscriptions.push(callback);

  return function remove() {
    const index = subscriptions.indexOf(callback);
    if (index > -1) {
      subscriptions.splice(index, 1);
    }
  };
}

export function triggerSubscriptions(subscriptions, ...args) {
  subscriptions.forEach((callback) => callback(...args));
}
