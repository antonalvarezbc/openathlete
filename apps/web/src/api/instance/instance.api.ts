import client, { routes } from '@/utils/axios';

import { InstanceInfoDto } from '@openathlete/shared';

export class InstanceAPI {
  static async getInstanceInfo(): Promise<InstanceInfoDto> {
    const res = await client.get(routes.instance.getInstanceInfo);
    return res.data;
  }
}
