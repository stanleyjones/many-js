import { Address } from "../../../../identity"
import {
  AccountFeature,
  AccountFeatureTypes,
  AccountMultisigArgument,
  AccountRole,
  EventType,
  MultisigTransactionState,
} from "../../types"
import {
  accountSource,
  Address2,
  identityStr1,
  identityStr2,
  identityStr3,
  makeLedgerSendParamResponse,
  makeMockResponseMessage,
  setupModule,
  taggedAccountSource,
  txnSymbolAddress1,
} from "../../test/test-utils"
import { Account } from "../account"
import { makeLedgerSendParam } from "../../../../utils"
import { ONE_MINUTE, eventTypeNameToIndices } from "../../../../const"
import { tag } from "../../../../message/cbor"
import { Message } from "../../../../message"

describe("Account", () => {
  it("info() should return accountInfo", async () => {
    const accountName = "my-account"
    const roles = new Map()
    roles.set(identityStr2, [AccountRole.owner, AccountRole.canMultisigSubmit])
    roles.set(identityStr1, [AccountRole.canMultisigApprove])
    roles.set(identityStr3, [AccountRole.canMultisigApprove])
    const _roles = Array.from(roles).reduce((acc, rolesForAddress) => {
      const [address, roleList] = rolesForAddress
      const taggedIdentity = tag(10000, Address.fromString(address).toBuffer())
      acc.set(taggedIdentity, roleList)
      return acc
    }, new Map())
    const features: AccountFeature[] = [
      [
        AccountFeatureTypes.accountMultisig,
        // @ts-ignore
        new Map([
          [AccountMultisigArgument.threshold, 2],
          [AccountMultisigArgument.executeAutomatically, false],
          [AccountMultisigArgument.expireInSecs, 86400],
        ]),
      ],
    ]
    const content = new Map()
    content.set(0, accountName).set(1, _roles).set(2, features)
    const mockCall = jest.fn(async () => {
      return makeMockResponseMessage(content)
    })
    const account = setupModule(Account, mockCall)
    const res = await account.info("m123")
    expect(mockCall).toHaveBeenCalledTimes(1)
    expect(mockCall).toHaveBeenCalledWith(
      "account.info",
      new Map([[0, "m123"]]),
    )
    expect(res).toEqual({
      accountInfo: {
        description: accountName,
        roles,
        features: new Map([
          [
            AccountFeatureTypes[1],
            //@ts-ignore
            new Map([
              [AccountMultisigArgument[0], 2],
              [AccountMultisigArgument[1], 86400],
              [AccountMultisigArgument[2], false],
            ]),
          ],
        ]),
      },
    })
  })

  it("should submit multisig transactions", async () => {
    const opts = {
      nonce: new ArrayBuffer(16),
    }
    const resMultisigToken = new Uint8Array()
    const mockCall = jest.fn(async () => {
      return makeMockResponseMessage(new Map().set(0, resMultisigToken))
    })
    const account = setupModule(Account, mockCall)
    const txnData = {
      amount: BigInt(1),
      to: "m123",
      from: "m321",
      symbol: "m456",
      memo: ["this is a memo"],
      executeAutomatically: false,
      threshold: 3,
      expireInSecs: 3600,
    }

    const res = await account.submitMultisigTxn(EventType.send, txnData, opts)

    const expectedCallArgs = new Map()
      .set(0, txnData.from)
      .set(
        2,
        new Map()
          .set(0, eventTypeNameToIndices[EventType.send])
          .set(1, makeLedgerSendParam(txnData)),
      )
      .set(3, 3)
      .set(4, 3600)
      .set(5, false)
      .set(7, txnData.memo)
    expect(mockCall).toHaveBeenCalledWith(
      "account.multisigSubmitTransaction",
      expectedCallArgs,
      opts,
    )
    expect(res).toEqual({ token: resMultisigToken })
  })

  it("multisigInfo() should return info about the multisig transaction", async () => {
    const expireDate = new Date(new Date().getTime() + ONE_MINUTE).getTime()
    const mockCall = jest.fn(async () => {
      return makeMockResponseMessage(
        makeMultisigInfoResponse({
          expireDate,
          txnState: MultisigTransactionState.pending,
        }),
      )
    })
    const account = setupModule(Account, mockCall)

    const res = await account.multisigInfo(new ArrayBuffer(0))
    expect(mockCall).toHaveBeenCalledWith(
      "account.multisigInfo",
      new Map().set(0, new ArrayBuffer(0)),
    )
    expect(res).toEqual({
      info: {
        memo: ["this is a memo"],
        transaction: {
          type: EventType.send,
          from: accountSource,
          to: identityStr1,
          symbolAddress: txnSymbolAddress1,
          amount: BigInt(2),
        },
        submitter: identityStr2,
        approvers: new Map([[identityStr2, true]]),
        threshold: 2,
        executeAutomatically: false,
        expireDate,
        state: MultisigTransactionState[MultisigTransactionState.pending],
      },
    })
  })

  it("create() should create an account and return address", async () => {
    const mockCall = jest.fn(async () => {
      return makeMockResponseMessage(new Map().set(0, taggedAccountSource))
    })
    const opts = {
      nonce: new ArrayBuffer(16),
    }
    const account = setupModule(Account, mockCall)
    const roles = makeRoles()
    const features: AccountFeature[] = makeAccountFeatures()
    const res = await account.create(
      { name: "account name", roles, features },
      opts,
    )
    expect(mockCall).toHaveBeenCalledWith(
      "account.create",
      new Map().set(0, "account name").set(1, roles).set(2, features),
      opts,
    )
    expect(res).toEqual({ address: accountSource })
  })

  it("addFeatures()", async () => {
    const mockCall = jest.fn(async () => {
      return makeMockResponseMessage(null)
    })
    const account = setupModule(Account, mockCall)
    const roles = makeRoles()
    const features: AccountFeature[] = makeAccountFeatures()
    const res = await account.addFeatures({
      account: accountSource,
      roles,
      features,
    })
    expect(mockCall).toHaveBeenCalledWith(
      "account.addFeatures",
      new Map().set(0, accountSource).set(1, roles).set(2, features),
    )
    expect(res).toEqual(null)
  })

  it("setDescription()", async () => {
    const mockCall = jest.fn(async () => {
      return makeMockResponseMessage(null)
    })
    const newDescription = "new account name"
    const account = setupModule(Account, mockCall)
    const res = await account.setDescription(accountSource, newDescription)
    expect(mockCall).toHaveBeenCalledWith(
      "account.setDescription",
      new Map().set(0, accountSource).set(1, newDescription),
    )
    expect(res).toEqual(null)
  })

  it("addRoles()", async () => {
    const mockCall = jest.fn(async () => {
      return makeMockResponseMessage(null)
    })
    const newRoles = makeRoles()
    const account = setupModule(Account, mockCall)
    const res = await account.addRoles(accountSource, newRoles)
    expect(mockCall).toHaveBeenCalledWith(
      "account.addRoles",
      new Map().set(0, accountSource).set(1, newRoles),
    )
    expect(res).toEqual(null)
  })

  it("removeRoles()", async () => {
    const mockCall = jest.fn(async () => {
      return makeMockResponseMessage(null)
    })
    const newRoles = makeRoles()
    const account = setupModule(Account, mockCall)
    const res = await account.removeRoles(accountSource, newRoles)
    expect(mockCall).toHaveBeenCalledWith(
      "account.removeRoles",
      new Map().set(0, accountSource).set(1, newRoles),
    )
    expect(res).toEqual(null)
  })

  it("multisigApprove() should approve a transaction", async () => {
    const mockCall = jest.fn(async () => {
      return makeMockResponseMessage(undefined)
    })
    const account = setupModule(Account, mockCall)
    const res = await account.multisigApprove(new ArrayBuffer(0))
    expect(mockCall).toHaveBeenCalledWith(
      "account.multisigApprove",
      new Map([[0, new ArrayBuffer(0)]]),
    )
  })
  it("multisigApprove() should throw", async () => {
    const mockCall = jest.fn(async () => {
      const content = new Map().set(
        4,
        new Map().set(0, -1).set(1, "this is an error message"),
      )

      return new Message(content)
    })
    const account = setupModule(Account, mockCall)
    try {
      const res = await account.multisigApprove(new ArrayBuffer(0))
    } catch (e) {
      expect(mockCall).toHaveBeenCalledWith(
        "account.multisigApprove",
        new Map([[0, new ArrayBuffer(0)]]),
      )
      expect((e as Error).message).toBe("this is an error message")
    }
  })
  it("multisigRevoke() should revoke a transaction", async () => {
    const mockCall = jest.fn(async () => {
      return makeMockResponseMessage(undefined)
    })
    const account = setupModule(Account, mockCall)
    const res = await account.multisigRevoke(new ArrayBuffer(0))
    expect(mockCall).toHaveBeenCalledWith(
      "account.multisigRevoke",
      new Map([[0, new ArrayBuffer(0)]]),
    )
  })
  it("multisigExecute() should execute a transaction", async () => {
    const mockCall = jest.fn(async () => {
      return makeMockResponseMessage(undefined)
    })
    const account = setupModule(Account, mockCall)
    const res = await account.multisigExecute(new ArrayBuffer(0))
    expect(mockCall).toHaveBeenCalledWith(
      "account.multisigExecute",
      new Map([[0, new ArrayBuffer(0)]]),
    )
  })
  it("multisigWithdraw() should execute a transaction", async () => {
    const mockCall = jest.fn(async () => {
      return makeMockResponseMessage(undefined)
    })
    const account = setupModule(Account, mockCall)
    const res = await account.multisigWithdraw(new ArrayBuffer(0))
    expect(mockCall).toHaveBeenCalledWith(
      "account.multisigWithdraw",
      new Map([[0, new ArrayBuffer(0)]]),
    )
  })

  it("multisigSetDefaults()", async () => {
    const mockCall = jest.fn(async () => {
      return makeMockResponseMessage(undefined)
    })
    const account = setupModule(Account, mockCall)
    const res = await account.multisigSetDefaults({
      account: accountSource,
      executeAutomatically: true,
      expireInSecs: 86400,
      threshold: 3,
    })
    const expectedArgs = new Map()
      .set(0, accountSource)
      .set(1, 3)
      .set(2, 86400)
      .set(3, true)
    expect(mockCall).toHaveBeenCalledWith(
      "account.multisigSetDefaults",
      expectedArgs,
    )
  })
})

function makeMultisigInfoResponse({
  expireDate,
  txnState,
}: {
  expireDate: number
  txnState: MultisigTransactionState
}) {
  const accountMultisigTxn = new Map().set(0, eventTypeNameToIndices.send).set(
    1,
    makeLedgerSendParamResponse({
      source: accountSource,
      destination: identityStr1,
      symbol: txnSymbolAddress1,
      amount: 2,
    }),
  )
  const submitter = tag(10000, Address2)
  const approvers = new Map().set(submitter, new Map().set(0, true))
  const threshold = 2
  const executeAutomatically = false
  return new Map()
    .set(1, accountMultisigTxn)
    .set(2, submitter)
    .set(3, approvers)
    .set(4, threshold)
    .set(5, executeAutomatically)
    .set(6, tag(1, expireDate))
    .set(8, txnState)
    .set(9, ["this is a memo"])
}

function makeAccountFeatures(): AccountFeature[] {
  return [
    AccountFeatureTypes.accountLedger,
    [
      AccountFeatureTypes.accountMultisig,
      new Map()
        .set(AccountMultisigArgument.threshold, 2)
        .set(AccountMultisigArgument.expireInSecs, 3600)
        .set(AccountMultisigArgument.executeAutomatically, false),
    ],
  ]
}

function makeRoles() {
  return new Map().set(identityStr1, [
    AccountRole[AccountRole.canMultisigApprove],
    AccountRole[AccountRole.canMultisigSubmit],
  ])
}
