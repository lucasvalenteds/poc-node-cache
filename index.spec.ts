import Axios, { AxiosInstance } from "axios";
import AxiosMockAdapter from "axios-mock-adapter";
import Redis from "ioredis";
import { StartedTestContainer, GenericContainer } from "testcontainers";

import {
  Item,
  ItemService,
  ItemServiceAxios,
  ItemServiceRedis,
  ItemServiceCached,
} from "./";

const mockItemId: string = "cca12a3a-8f34-11ea-8d58-a3e15677259a";
const mockItem: Item = {
  id: mockItemId,
  price: 3.5,
};

const httpClient: AxiosInstance = Axios.create();
const httpMock: AxiosMockAdapter = new AxiosMockAdapter(httpClient);

let container: StartedTestContainer;
let redisClient: Redis.Redis;

beforeAll(async (done) => {
  container = await new GenericContainer("redis", "5-alpine")
    .withExposedPorts(6379)
    .withNetworkMode("bridge")
    .start();

  const [host, port] = [
    container.getContainerIpAddress(),
    container.getMappedPort(6379),
  ];

  redisClient = new Redis({ host, port });

  done();
});

afterAll(async (done) => {
  redisClient.disconnect();
  await container.stop();

  done();
});

beforeEach(async (done) => {
  await redisClient.set(`items:${mockItemId}`, JSON.stringify(mockItem));
  httpMock.onGet(`/items/${mockItemId}`).reply(200, mockItem);

  done();
});

afterEach(async (done) => {
  await redisClient.del(`items:${mockItemId}`);
  httpMock.resetHandlers();

  done();
});

describe("ItemServiceAxios", () => {
  test("It returns item", async () => {
    const itemService: ItemService = new ItemServiceAxios(httpClient);

    const item = await itemService.findById(mockItemId);

    expect(item).toStrictEqual(mockItem);
  });
  test("It throws error", async () => {
    expect.assertions(1);

    const itemService: ItemService = new ItemServiceAxios(httpClient);

    try {
      await itemService.findById("123");
    } catch (error) {
      expect(error.message).toStrictEqual(
        "Request failed with status code 404"
      );
    }
  });
});

describe("ItemServiceRedis", () => {
  test("It returns item", async () => {
    const itemService: ItemService = new ItemServiceRedis(redisClient);

    const item = await itemService.findById(mockItemId);

    expect(item).toStrictEqual(mockItem);
  });
  test("It throws error", async () => {
    expect.assertions(1);

    const itemService: ItemService = new ItemServiceRedis(redisClient);

    try {
      await itemService.findById("123");
    } catch (error) {
      expect(error.message).toStrictEqual("None item found with ID 123");
    }
  });
});

describe("ItemServiceCached", () => {
  const mockFindByIdSuccess = jest.fn().mockResolvedValue(mockItem);
  const mockFindByIdFailure = jest.fn().mockRejectedValue(Error("Not found"));

  beforeEach(() => jest.clearAllMocks());

  test("It gets from cache", async () => {
    const itemService: ItemService = new ItemServiceCached(
      { findById: mockFindByIdSuccess },
      { findById: mockFindByIdFailure }
    );

    const item = await itemService.findById(mockItemId);

    expect(item).toStrictEqual(mockItem);
    expect(mockFindByIdFailure).not.toHaveBeenCalled();
    expect(mockFindByIdSuccess).toHaveReturned();
  });
  test("It gets from http when cache throws error", async () => {
    const itemService: ItemService = new ItemServiceCached(
      { findById: mockFindByIdFailure },
      { findById: mockFindByIdSuccess }
    );

    const item = await itemService.findById(mockItemId);

    expect(item).toStrictEqual(mockItem);
    expect(mockFindByIdFailure).toHaveBeenCalledTimes(1);
    expect(mockFindByIdSuccess).toHaveReturned();
  });
  test("It throws error when cache and http throws error", async () => {
    expect.assertions(2);

    const itemService: ItemService = new ItemServiceCached(
      { findById: mockFindByIdFailure },
      { findById: mockFindByIdFailure }
    );

    try {
      await itemService.findById(mockItemId);
    } catch (error) {
      expect(mockFindByIdFailure).toHaveBeenCalledTimes(2);
      expect(error.message).toStrictEqual("Not found");
    }
  });
});
