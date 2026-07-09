import Taro from "@tarojs/taro";

export async function requestJson<T>(
  url: string,
  options?: { header?: Record<string, string> },
): Promise<T> {
  const res = await Taro.request({
    url,
    method: "GET",
    timeout: 20000,
    header: {
      Accept: "application/json,text/plain,*/*",
      ...options?.header,
    },
  });

  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`请求失败 (${res.statusCode})`);
  }

  return res.data as T;
}
