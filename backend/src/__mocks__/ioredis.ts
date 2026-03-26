function RedisMock(this: any) {
  return {
    publish: jest.fn().mockResolvedValue(1),
    subscribe: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
  };
}

module.exports = RedisMock;
(module.exports as any).default = RedisMock;
