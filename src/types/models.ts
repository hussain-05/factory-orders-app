export type UserRole = 'shop' | 'factory'

export type ShopName = 'Seva' | 'Seva Mart' | 'Seva Super Store'

export type OrderKind = 'unlimited' | 'limited'

export type OrderStatus = 'pending' | 'completed'
export type Unit = 'box' | 'bag' | 'pcs'

export interface UserProfile {
  uid: string
  email: string
  displayName: string
  role: UserRole
  shopName?: ShopName
  createdAt: number
  isAdmin?: boolean
  whatsappNumber?: string
}

export interface UnlimitedProduct {
  id: string
  name: string
  size?: string
  defaultUnit?: Unit
  active: boolean
  sortIndex: number
}

export interface LimitedProduct {
  id: string
  name: string
  size: string
  stock: number
  rate: number
  photoUrl: string
  createdAt: number
  updatedAt: number
}

export interface OrderDispatch {
  id: string
  dispatchedAt: number
  items: Array<{
    productId: string
    name: string
    size?: string
    qty: number
  }>
  receivedAt?: number | null
}

export interface OrderLineItem {
  productId: string
  name: string
  size?: string
  quantity: number
  unit?: Unit
  rate?: number
}

export interface OrderMilestones {
  receivedAt?: number | null
  dispatchedAt?: number | null
}

export interface Order {
  id: string
  orderKind: OrderKind
  shopName: ShopName
  shopUserId: string
  requestorName: string
  requestorEmail: string
  items: OrderLineItem[]
  status: OrderStatus
  milestones: OrderMilestones
  expectedDeliveryDate?: number | null
  actualDeliveryDate?: number | null
  createdAt: number
  updatedAt: number
  completedAt?: number | null
  shopWhatsappNumber?: string
  orderNumber?: string
  dispatches?: OrderDispatch[]
}