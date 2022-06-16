import { transactionTypeIndices } from "../../../const"
import { Message } from "../../../message"
import { CborMap } from "../../../message/cbor"
import {
  getAccountFeaturesData,
  getAccountRolesData,
  getAddressFromTaggedIdentity,
  makeAccountInfoData,
  makeLedgerSendParam,
  makeTxnData,
} from "../../../utils"
import { Transaction } from "../ledger"
import {
  AccountInfoPayloadResponseLabels,
  LedgerSendParam,
  LedgerTransactionType,
  NetworkModule,
} from "../types"

export type GetAccountInfoResponse = ReturnType<typeof getAccountInfo>
type GetMultisigTokenReturnType = ReturnType<typeof getMultisigToken>
type SubmitMultisigTxnData = LedgerSendParam & { memo?: string }

export interface Account extends NetworkModule {
  info: (accountId: string) => Promise<GetAccountInfoResponse>
  submitMultisigTxn: (
    txnType: LedgerTransactionType,
    txnData: SubmitMultisigTxnData,
  ) => Promise<GetMultisigTokenReturnType>
  multisigInfo: (token: ArrayBuffer) => Promise<unknown>
  multisigApprove: (token: ArrayBuffer) => Promise<unknown>
  multisigRevoke: (token: ArrayBuffer) => Promise<unknown>
  multisigExecute: (token: ArrayBuffer) => Promise<unknown>
  multisigWithdraw: (token: ArrayBuffer) => Promise<unknown>
}

export type MultisigInfoResponse = {
  info: MultisigTransactionInfo | undefined
}

export type AccountInfoData = {
  name: string
  roles: ReturnType<typeof getAccountRolesData>
  features: ReturnType<typeof getAccountFeaturesData>
}

export type MultisigTransactionInfo = {
  memo?: string
  transaction?: Omit<Transaction, "id" | "time">
  submitter: string
  approvers: Map<string, boolean>
  threshold: number
  execute_automatically: boolean
  timeout: Date
  cborData?: CborMap
}

export const Account: Account = {
  _namespace_: "account",

  async info(accountId: string): Promise<GetAccountInfoResponse> {
    const message = await this.call("account.info", new Map([[0, accountId]]))
    return getAccountInfo(message)
  },

  async submitMultisigTxn(
    txnType: LedgerTransactionType,
    txnData: SubmitMultisigTxnData,
  ): Promise<GetMultisigTokenReturnType> {
    const m = new Map()
    m.set(0, txnData.from)
    txnData?.memo && m.set(1, txnData.memo)
    m.set(2, makeSubmittedTxnData(txnType, txnData))
    const msg = await this.call("account.multisigSubmitTransaction", m)
    return getMultisigToken(msg)
  },

  async multisigInfo(token: ArrayBuffer): Promise<MultisigInfoResponse> {
    const res = await this.call("account.multisigInfo", new Map([[0, token]]))
    return await getMultisigTxnData(res)
  },

  async multisigApprove(token: ArrayBuffer) {
    return await this.call("account.multisigApprove", new Map([[0, token]]))
  },

  async multisigRevoke(token: ArrayBuffer) {
    return await this.call("account.multisigRevoke", new Map([[0, token]]))
  },

  async multisigExecute(token: ArrayBuffer) {
    return await this.call("account.multisigExecute", new Map([[0, token]]))
  },

  async multisigWithdraw(token: ArrayBuffer) {
    return await this.call("account.multisigWithdraw", new Map([[0, token]]))
  },
}

async function getMultisigTxnData(msg: Message): Promise<MultisigInfoResponse> {
  const result: { info: MultisigTransactionInfo | undefined } = {
    info: undefined,
  }
  const content = msg.getPayload()
  if (content) {
    try {
      result.info = {
        memo: content.get(0),
        transaction: await makeTxnData(content.get(1) as Map<number, unknown>, {
          isTxnParamData: true,
        }),
        submitter: await getAddressFromTaggedIdentity(
          content.get(2) as { value: Uint8Array },
        ),
        approvers: await (async function (): Promise<Map<string, boolean>> {
          const result: Map<string, boolean> = new Map()
          for (let approver of Array.from(content.get(3))) {
            const [identity, hasApproved] = approver as [
              { value: Uint8Array },
              Map<number, boolean>,
            ]
            const address = await getAddressFromTaggedIdentity(identity)
            result.set(address, hasApproved.get(0) as boolean)
          }
          return result
        })(),
        threshold: content.get(4),
        execute_automatically: content.get(5),
        timeout: content.get(6),
        cborData: content.get(7),
      }
    } catch (e) {
      console.error("error in multisig txn data:", e)
    }
  }
  return result
}

function getMultisigToken(msg: Message) {
  const res: { token: ArrayBuffer | undefined } = {
    token: undefined,
  }
  const decoded = msg.getPayload()
  if (decoded) {
    res.token = decoded.get(0)
  }
  return res
}

function makeSubmittedTxnData(
  txnType: LedgerTransactionType,
  txnData: SubmitMultisigTxnData,
) {
  const accountMultisigTxn = new Map()
  let txnTypeIndices
  let txnParam
  if (txnType === LedgerTransactionType.send) {
    txnTypeIndices = transactionTypeIndices[LedgerTransactionType.send]
    txnParam = makeLedgerSendParam(txnData)
  }
  if (txnTypeIndices && txnParam) {
    accountMultisigTxn.set(0, txnTypeIndices)
    accountMultisigTxn.set(1, txnParam)
    return accountMultisigTxn
  }
  throw new Error(`transaction type not yet implemented: ${txnType}`)
}

function getAccountInfo(message: Message): {
  accountInfo: AccountInfoData | undefined
} {
  let result: { accountInfo: AccountInfoData | undefined } = {
    accountInfo: undefined,
  }
  const payload = message.getPayload()
  if (payload instanceof Map) {
    result.accountInfo = {
      ...makeAccountInfoData({
        name: payload.get(AccountInfoPayloadResponseLabels.name),
        roles: payload?.get?.(AccountInfoPayloadResponseLabels.roles),
        features: payload?.get?.(AccountInfoPayloadResponseLabels.features),
      }),
    }
  }
  return result
}
