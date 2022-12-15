import { Server } from "../server"
import { mapToObj, objToMap } from "../../shared/helpers"

export interface Get {
  value?: string
}

export interface GetArgs {
  key: string
}

const getMap = {
  0: "value",
}

const getArgsMap = { 0: "key" }

export async function get(server: Server, getArgs: GetArgs): Promise<Get> {
  const args = objToMap(getArgs, getArgsMap)
  const payload = await server.call("kvstore.get", args)
  return mapToObj<Get>(payload, getMap)
}
