import { AxiosInstance } from "axios";
import Redis from "ioredis";

export interface Item {
  id: string;
  price: number;
}

export interface ItemService {
  findById(itemId: string): Promise<Item>;
}

export class ItemServiceHttp implements ItemService {
  constructor(private httpClient: AxiosInstance) {}

  async findById(itemId: string): Promise<Item> {
    const response = await this.httpClient.get<Item>(`/items/${itemId}`);

    return response.data;
  }
}

export class ItemServiceRedis implements ItemService {
  constructor(private redisClient: Redis.Redis) {}

  async findById(itemId: string): Promise<Item> {
    const record = await this.redisClient.get(`items:${itemId}`);

    if (record === null) {
      throw Error(`None item found with ID ${itemId}`);
    }

    return JSON.parse(record);
  }
}

export class ItemServiceCached implements ItemService {
  constructor(
    private itemServiceRedis: ItemService,
    private itemServiceHttp: ItemService
  ) {}

  async findById(itemId: string): Promise<Item> {
    try {
      return await this.itemServiceRedis.findById(itemId);
    } catch (error) {
      return await this.itemServiceHttp.findById(itemId);
    }
  }
}
