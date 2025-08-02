import type { GetCatalogOptions, ProductCreate, ProductUpdate, SocketConfig } from '../Types'
import {
	parseCatalogNode,
	parseCollectionsNode,
	parseOrderDetailsNode,
	parseProductNode,
	toProductNode,
	uploadingNecessaryImagesOfProduct
} from '../Utils/business'
import { type BinaryNode, jidNormalizedUser, S_WHATSAPP_NET } from '../WABinary'
import { getBinaryNodeChild } from '../WABinary/generic-utils'
import { makeMessagesRecvSocket } from './messages-recv'

export const makeBusinessSocket = (config: SocketConfig) => {
	const sock = makeMessagesRecvSocket(config)
	const { authState, query, waUploadToServer } = sock

	const getCatalog = async ({ jid, limit, cursor }: GetCatalogOptions) => {
		jid = jid || authState.creds.me?.id
		jid = jidNormalizedUser(jid)

		const queryParamNodes: BinaryNode[] = [
			{
				tag: 'limit',
				attrs: {},
				content: Buffer.from((limit || 10).toString())
			},
			{
				tag: 'width',
				attrs: {},
				content: Buffer.from('100')
			},
			{
				tag: 'height',
				attrs: {},
				content: Buffer.from('100')
			}
		]

		if (cursor) {
			queryParamNodes.push({
				tag: 'after',
				attrs: {},
				content: cursor
			})
		}

		const result = await query({
			tag: 'iq',
			attrs: {
				to: S_WHATSAPP_NET,
				type: 'get',
				xmlns: 'w:biz:catalog'
			},
			content: [
				{
					tag: 'product_catalog',
					attrs: {
						jid,
						allow_shop_source: 'true'
					},
					content: queryParamNodes
				}
			]
		})
		return parseCatalogNode(result)
	}

	const getCollections = async (jid?: string, limit = 51) => {
		jid = jid || authState.creds.me?.id
		jid = jidNormalizedUser(jid)
		const result = await query({
			tag: 'iq',
			attrs: {
				to: S_WHATSAPP_NET,
				type: 'get',
				xmlns: 'w:biz:catalog',
				smax_id: '35'
			},
			content: [
				{
					tag: 'collections',
					attrs: {
						biz_jid: jid
					},
					content: [
						{
							tag: 'collection_limit',
							attrs: {},
							content: Buffer.from(limit.toString())
						},
						{
							tag: 'item_limit',
							attrs: {},
							content: Buffer.from(limit.toString())
						},
						{
							tag: 'width',
							attrs: {},
							content: Buffer.from('100')
						},
						{
							tag: 'height',
							attrs: {},
							content: Buffer.from('100')
						}
					]
				}
			]
		})

		return parseCollectionsNode(result)
	}

	const getOrderDetails = async (orderId: string, tokenBase64: string) => {
		const result = await query({
			tag: 'iq',
			attrs: {
				to: S_WHATSAPP_NET,
				type: 'get',
				xmlns: 'fb:thrift_iq',
				smax_id: '5'
			},
			content: [
				{
					tag: 'order',
					attrs: {
						op: 'get',
						id: orderId
					},
					content: [
						{
							tag: 'image_dimensions',
							attrs: {},
							content: [
								{
									tag: 'width',
									attrs: {},
									content: Buffer.from('100')
								},
								{
									tag: 'height',
									attrs: {},
									content: Buffer.from('100')
								}
							]
						},
						{
							tag: 'token',
							attrs: {},
							content: Buffer.from(tokenBase64)
						}
					]
				}
			]
		})

		return parseOrderDetailsNode(result)
	}

	const productUpdate = async (productId: string, update: ProductUpdate) => {
		update = await uploadingNecessaryImagesOfProduct(update, waUploadToServer)
		const editNode = toProductNode(productId, update)

		const result = await query({
			tag: 'iq',
			attrs: {
				to: S_WHATSAPP_NET,
				type: 'set',
				xmlns: 'w:biz:catalog'
			},
			content: [
				{
					tag: 'product_catalog_edit',
					attrs: { v: '1' },
					content: [
						editNode,
						{
							tag: 'width',
							attrs: {},
							content: '100'
						},
						{
							tag: 'height',
							attrs: {},
							content: '100'
						}
					]
				}
			]
		})

		const productCatalogEditNode = getBinaryNodeChild(result, 'product_catalog_edit')
		const productNode = getBinaryNodeChild(productCatalogEditNode, 'product')

		return parseProductNode(productNode!)
	}

	const productCreate = async (create: ProductCreate) => {
		// ensure isHidden is defined
		create.isHidden = !!create.isHidden
		create = await uploadingNecessaryImagesOfProduct(create, waUploadToServer)
		const createNode = toProductNode(undefined, create)

		const result = await query({
			tag: 'iq',
			attrs: {
				to: S_WHATSAPP_NET,
				type: 'set',
				xmlns: 'w:biz:catalog'
			},
			content: [
				{
					tag: 'product_catalog_add',
					attrs: { v: '1' },
					content: [
						createNode,
						{
							tag: 'width',
							attrs: {},
							content: '100'
						},
						{
							tag: 'height',
							attrs: {},
							content: '100'
						}
					]
				}
			]
		})

		const productCatalogAddNode = getBinaryNodeChild(result, 'product_catalog_add')
		const productNode = getBinaryNodeChild(productCatalogAddNode, 'product')

		return parseProductNode(productNode!)
	}

	const productDelete = async (productIds: string[]) => {
		const result = await query({
			tag: 'iq',
			attrs: {
				to: S_WHATSAPP_NET,
				type: 'set',
				xmlns: 'w:biz:catalog'
			},
			content: [
				{
					tag: 'product_catalog_delete',
					attrs: { v: '1' },
					content: productIds.map(id => ({
						tag: 'product',
						attrs: {},
						content: [
							{
								tag: 'id',
								attrs: {},
								content: Buffer.from(id)
							}
						]
					}))
				}
			]
		})

		const productCatalogDelNode = getBinaryNodeChild(result, 'product_catalog_delete')
		return {
			deleted: +(productCatalogDelNode?.attrs.deleted_count || 0)
		}
	}

	const updateBusinessProfile = async (
		jid: string,
		profile: {
			address?: string
			description?: string
			website?: string[]
			email?: string
			category?: string
			business_hours?: {
			timezone: string
			business_config: {
				day_of_week: string
				mode: 'open_24h' | 'closed' | 'specific_hours' | 'appointment_only'
				open_time?: string
				close_time?: string
			}[]
			}
		}
		): Promise<void> => {
		const content = []

		if (profile.address)
			content.push({ tag: 'address', attrs: {}, content: profile.address })

		if (profile.description)
			content.push({ tag: 'description', attrs: {}, content: profile.description })

		if (profile.website) {
			for (const url of profile.website) {
			content.push({ tag: 'website', attrs: {}, content: url })
			}
		}

		if (profile.email)
			content.push({ tag: 'email', attrs: {}, content: profile.email })

		if (profile.category)
			content.push({ tag: 'category', attrs: {}, content: profile.category })

		if (profile.business_hours) {
			const bhConfig = profile.business_hours.business_config.map(cfg => {
			const attrs: Record<string, string> = {
				day_of_week: cfg.day_of_week,
				mode: cfg.mode
			}

			if (cfg.mode === 'specific_hours') {
				if (cfg.open_time) attrs.open_time = cfg.open_time
				if (cfg.close_time) attrs.close_time = cfg.close_time
			}

			return { tag: 'config', attrs }
			})

			content.push({
			tag: 'business_hours',
			attrs: {
				timezone: profile.business_hours.timezone
			},
			content: bhConfig
			})
		}

		const node = {
			tag: 'iq',
			attrs: {
			to: 's.whatsapp.net',
			type: 'set',
			xmlns: 'w:biz'
			},
			content: [
			{
				tag: 'business_profile',
				attrs: { v: '244' },
				content: [
				{
					tag: 'profile',
					attrs: { jid },
					content
				}
				]
			}
			]
		}

		await query(node);
	}


	return {
		...sock,
		logger: config.logger,
		getOrderDetails,
		getCatalog,
		getCollections,
		productCreate,
		productDelete,
		productUpdate,
		updateBusinessProfile
	}
}
