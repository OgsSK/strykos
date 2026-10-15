import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Boolean, Integer, Numeric, DateTime, Date, ForeignKey, JSON, UniqueConstraint
)
from sqlalchemy.orm import relationship
from database import Base


def gen_uuid():
    return str(uuid.uuid4())


def utcnow():
    return datetime.now(timezone.utc)


class Profile(Base):
    __tablename__ = "profiles"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    first_name = Column(String(120), default="")
    last_name = Column(String(120), default="")
    phone = Column(String(60), default="")
    # ⭐ Rôles supportés : customer | admin | driver
    role = Column(String(30), default="customer", index=True)
    preferred_language = Column(String(5), default="fr")
    # ⭐ NOUVEAU : confirmation d'email obligatoire pour activer le compte
    email_verified = Column(Boolean, default=False, nullable=False, server_default="false", index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    addresses = relationship("UserAddress", back_populates="user", cascade="all, delete-orphan")

    def to_dict(self):
        return {
            "id": self.id, "email": self.email, "first_name": self.first_name,
            "last_name": self.last_name, "phone": self.phone, "role": self.role,
            "preferred_language": self.preferred_language,
            "email_verified": bool(self.email_verified),
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class UserAddress(Base):
    __tablename__ = "user_addresses"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    label = Column(String(80), default="")
    first_name = Column(String(120), default="")
    last_name = Column(String(120), default="")
    phone = Column(String(60), default="")
    country = Column(String(80), default="")
    city = Column(String(120), default="")
    address_line = Column(Text, default="")
    postal_code = Column(String(40), default="")
    is_default = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    user = relationship("Profile", back_populates="addresses")

    def to_dict(self):
        return {
            "id": self.id, "label": self.label, "first_name": self.first_name,
            "last_name": self.last_name, "phone": self.phone, "country": self.country,
            "city": self.city, "address_line": self.address_line,
            "postal_code": self.postal_code, "is_default": self.is_default,
        }


class Brand(Base):
    __tablename__ = "brands"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(120), nullable=False)
    slug = Column(String(140), unique=True, nullable=False, index=True)
    logo_url = Column(Text, default="")
    description_fr = Column(Text, default="")
    description_en = Column(Text, default="")
    is_local = Column(Boolean, default=False, index=True)
    published = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "slug": self.slug, "logo_url": self.logo_url,
            "description_fr": self.description_fr, "description_en": self.description_en,
            "is_local": self.is_local, "published": self.published,
        }


class Category(Base):
    __tablename__ = "categories"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    slug = Column(String(140), unique=True, nullable=False, index=True)
    name_fr = Column(String(140), nullable=False)
    name_en = Column(String(140), nullable=False)
    type = Column(String(40), default="", index=True)
    parent_id = Column(String(36), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True)
    position = Column(Integer, default=0)
    published = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    def to_dict(self):
        return {
            "id": self.id, "slug": self.slug, "name_fr": self.name_fr, "name_en": self.name_en,
            "type": self.type, "parent_id": self.parent_id, "position": self.position,
            "published": self.published,
        }


class Product(Base):
    __tablename__ = "products"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    slug = Column(String(180), unique=True, nullable=False, index=True)
    sku = Column(String(80), default="")
    brand_id = Column(String(36), ForeignKey("brands.id", ondelete="SET NULL"), nullable=True, index=True)
    category_id = Column(String(36), ForeignKey("categories.id", ondelete="SET NULL"), nullable=True, index=True)
    name_fr = Column(String(220), nullable=False)
    name_en = Column(String(220), nullable=False)
    description_fr = Column(Text, default="")
    description_en = Column(Text, default="")
    price_eur = Column(Numeric(12, 2), nullable=False, default=0)
    price_usd = Column(Numeric(12, 2), nullable=True)
    price_xof = Column(Numeric(12, 2), nullable=True)
    sale_price_eur = Column(Numeric(12, 2), nullable=True)
    is_new = Column(Boolean, default=False, index=True)
    is_featured = Column(Boolean, default=False, index=True)
    is_best_seller = Column(Boolean, default=False, index=True)
    gender = Column(String(30), default="", index=True)     # occasion : anniversaire | mariage | ...
    sport = Column(String(40), default="", index=True)      # saveur : chocolat | vanille | ...
    club = Column(String(120), default="", index=True)
    national_team = Column(String(120), default="", index=True)
    surface = Column(String(60), default="")
    product_type = Column(String(60), default="")
    colors = Column(JSON, default=list)
    customizable = Column(Boolean, default=False)
    customization_price_eur = Column(Numeric(12, 2), default=0)
    # ⭐ Champs de personnalisation configurables par produit
    # Format : [{"key":"message","type":"text","label_fr":"...","label_en":"...",
    #            "placeholder_fr":"...","placeholder_en":"...","required":true,
    #            "max_length":30,"price_eur":2.0,"default_value":"","options":[]}]
    customization_fields = Column(JSON, default=list)
    # ⭐ NOUVEAU : texte du bouton sur la home (vide = auto)
    # Valeurs : "" | "auto" | "add_to_cart" | "choose" | "customize" | "order" | "view"
    cta_label = Column(String(40), default="")
    video_url = Column(Text, default="")
    sales_count = Column(Integer, default=0)
    published = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    brand = relationship("Brand")
    category = relationship("Category")
    images = relationship("ProductImage", back_populates="product", cascade="all, delete-orphan", order_by="ProductImage.position")
    variants = relationship("ProductVariant", back_populates="product", cascade="all, delete-orphan")


class ProductImage(Base):
    __tablename__ = "product_images"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    product_id = Column(String(36), ForeignKey("products.id", ondelete="CASCADE"), index=True)
    url = Column(Text, nullable=False)
    position = Column(Integer, default=0)

    product = relationship("Product", back_populates="images")


class ProductVariant(Base):
    __tablename__ = "product_variants"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    product_id = Column(String(36), ForeignKey("products.id", ondelete="CASCADE"), index=True)
    size = Column(String(40), default="")
    color = Column(String(60), default="")
    sku = Column(String(80), default="")
    stock = Column(Integer, default=0)
    extra_price_eur = Column(Numeric(12, 2), default=0)

    product = relationship("Product", back_populates="variants")

    def to_dict(self):
        return {
            "id": self.id, "size": self.size, "color": self.color, "sku": self.sku,
            "stock": self.stock, "extra_price_eur": float(self.extra_price_eur or 0),
        }


class WishlistItem(Base):
    __tablename__ = "wishlist_items"
    __table_args__ = (UniqueConstraint("user_id", "product_id", name="uq_wishlist_user_product"),)
    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    product_id = Column(String(36), ForeignKey("products.id", ondelete="CASCADE"), index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Order(Base):
    __tablename__ = "orders"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    order_number = Column(String(40), unique=True, nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True, index=True)
    email = Column(String(255), default="")
    first_name = Column(String(120), default="")
    last_name = Column(String(120), default="")
    phone = Column(String(60), default="")
    status = Column(String(40), default="pending_payment", index=True)
    payment_status = Column(String(40), default="pending", index=True)
    currency = Column(String(5), default="EUR")
    charge_currency = Column(String(5), default="EUR")
    subtotal = Column(Numeric(14, 2), default=0)
    shipping_cost = Column(Numeric(14, 2), default=0)
    discount = Column(Numeric(14, 2), default=0)
    total = Column(Numeric(14, 2), default=0)
    charge_total = Column(Numeric(14, 2), default=0)
    payment_notice = Column(Text, default="")
    customer_note = Column(Text, default="")   # ⭐ Note / instructions du client
    # ⭐ Commande programmée
    scheduled_date = Column(Date, nullable=True, index=True)   # Date souhaitée (YYYY-MM-DD)
    scheduled_time_slot = Column(String(40), default="")       # Ex: "matin", "apres-midi", "soir"
    # ⭐ NOUVEAU : code OTP de livraison
    delivery_otp = Column(String(6), default="")
    delivery_otp_expires_at = Column(DateTime(timezone=True), nullable=True)
    delivery_otp_attempts = Column(Integer, default=0)
    delivery_otp_locked = Column(Boolean, default=False)
    delivered_by_driver_id = Column(String(36), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True)
    delivered_via = Column(String(20), default="")  # "otp" | "admin_manual"
    driver_assigned_at = Column(DateTime(timezone=True), nullable=True)
    shipping_address = Column(JSON, default=dict)
    shipping_method = Column(JSON, default=dict)
    items = Column(JSON, default=list)
    stripe_session_id = Column(String(255), default="", index=True)
    lang = Column(String(5), default="fr")
    promo_code = Column(String(60), default="", index=True)
    tracking_carrier = Column(String(120), default="")
    tracking_number = Column(String(120), default="")
    tracking_url = Column(Text, default="")
    admin_notes = Column(Text, default="")
    status_history = Column(JSON, default=list)
    shipped_at = Column(DateTime(timezone=True), nullable=True)
    delivered_at = Column(DateTime(timezone=True), nullable=True)
    review_request_sent_at = Column(DateTime(timezone=True), nullable=True)
    hidden_by_customer = Column(Boolean, default=False, index=True)
    cancellation_reason = Column(Text, default="")
    cancellation_requested_at = Column(DateTime(timezone=True), nullable=True)
    cancellation_decided_at = Column(DateTime(timezone=True), nullable=True)
    cancellation_refused_reason = Column(Text, default="")
    # --- Retours / RMA ---
    return_reason = Column(Text, default="")
    return_type = Column(String(20), default="")
    return_products = Column(JSON, default=list)
    return_rma_code = Column(String(80), default="", index=True)
    return_label_url = Column(Text, default="")
    return_requested_at = Column(DateTime(timezone=True), nullable=True)
    return_decided_at = Column(DateTime(timezone=True), nullable=True)
    return_refused_reason = Column(Text, default="")
    return_tracking_number = Column(String(120), default="")
    return_received_at = Column(DateTime(timezone=True), nullable=True)
    return_exchange_product_id = Column(String(36), nullable=True)
    return_exchange_variant_id = Column(String(36), nullable=True)
    exchange_price_diff = Column(Numeric(14, 2), default=0)
    exchange_payment_status = Column(String(20), default="")
    exchange_stripe_session_id = Column(String(255), default="")
    # ⭐ NOUVEAU : message de remboursement envoyé au client
    refund_message = Column(Text, default="")
    # ⭐ NOUVEAU : réclamation — médias + demande d'info admin
    claim_media_urls = Column(JSON, default=list)               # [{"type": "image"|"video", "url": "..."}]
    claim_info_requested_at = Column(DateTime(timezone=True), nullable=True)
    claim_info_request_message = Column(Text, default="")
    claim_info_request_types = Column(JSON, default=list)       # ["photo","video"]
    shipping_origin_country = Column(String(5), default="")
    shipping_segments = Column(JSON, default=list)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    def to_dict(self, public=False):
        d = {
            "id": self.id, "order_number": self.order_number,
            "email": self.email, "first_name": self.first_name, "last_name": self.last_name,
            "status": self.status, "payment_status": self.payment_status,
            "currency": self.currency, "charge_currency": self.charge_currency,
            "subtotal": float(self.subtotal or 0), "shipping_cost": float(self.shipping_cost or 0),
            "discount": float(self.discount or 0), "total": float(self.total or 0),
            "charge_total": float(self.charge_total or 0), "payment_notice": self.payment_notice,
            # ⭐ Commande programmée (visibles client + admin)
            "scheduled_date": self.scheduled_date.isoformat() if self.scheduled_date else None,
            "scheduled_time_slot": self.scheduled_time_slot or "",
            "shipping_method": self.shipping_method, "items": self.items,
            "lang": self.lang, "promo_code": self.promo_code,
            "tracking_carrier": self.tracking_carrier, "tracking_number": self.tracking_number,
            "tracking_url": self.tracking_url, "status_history": self.status_history or [],
            "shipped_at": self.shipped_at.isoformat() if self.shipped_at else None,
            "delivered_at": self.delivered_at.isoformat() if self.delivered_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if not public:
            d.update({"user_id": self.user_id, "phone": self.phone, "shipping_address": self.shipping_address,
                      "stripe_session_id": self.stripe_session_id, "admin_notes": self.admin_notes,
                      "hidden_by_customer": bool(self.hidden_by_customer),
                      "customer_note": self.customer_note or "",
                      "cancellation_reason": self.cancellation_reason or "",
                      "cancellation_requested_at": self.cancellation_requested_at.isoformat() if self.cancellation_requested_at else None,
                      "cancellation_decided_at": self.cancellation_decided_at.isoformat() if self.cancellation_decided_at else None,
                      "cancellation_refused_reason": self.cancellation_refused_reason or "",
                      "return_reason": self.return_reason or "",
                      "return_type": self.return_type or "",
                      "return_products": self.return_products or [],
                      "return_rma_code": self.return_rma_code or "",
                      "return_label_url": self.return_label_url or "",
                      "return_requested_at": self.return_requested_at.isoformat() if self.return_requested_at else None,
                      "return_decided_at": self.return_decided_at.isoformat() if self.return_decided_at else None,
                      "return_refused_reason": self.return_refused_reason or "",
                      "return_tracking_number": self.return_tracking_number or "",
                      "return_received_at": self.return_received_at.isoformat() if self.return_received_at else None,
                      "return_exchange_product_id": self.return_exchange_product_id,
                      "return_exchange_variant_id": self.return_exchange_variant_id,
                      "exchange_price_diff": float(self.exchange_price_diff or 0),
                      "exchange_payment_status": self.exchange_payment_status or "",
                      "exchange_stripe_session_id": self.exchange_stripe_session_id or "",
                      "refund_message": self.refund_message or "",
                      # ⭐ NOUVEAU : réclamation — médias + demande d'info admin
                      "claim_media_urls": self.claim_media_urls or [],
                      "claim_info_requested_at": self.claim_info_requested_at.isoformat() if self.claim_info_requested_at else None,
                      "claim_info_request_message": self.claim_info_request_message or "",
                      "claim_info_request_types": self.claim_info_request_types or [],
                      # ⭐ NOUVEAU : code OTP de livraison
                      "delivery_otp": self.delivery_otp or "",
                      "delivery_otp_expires_at": self.delivery_otp_expires_at.isoformat() if self.delivery_otp_expires_at else None,
                      "delivery_otp_attempts": self.delivery_otp_attempts or 0,
                      "delivery_otp_locked": bool(self.delivery_otp_locked),
                      "delivered_by_driver_id": self.delivered_by_driver_id,
                      "delivered_via": self.delivered_via or "",
                      "driver_assigned_at": self.driver_assigned_at.isoformat() if self.driver_assigned_at else None,
                      "shipping_origin_country": self.shipping_origin_country or "",
                      "shipping_segments": self.shipping_segments or []})
        return d


class Payment(Base):
    __tablename__ = "payments"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    order_id = Column(String(36), ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    provider = Column(String(40), default="stripe")
    session_id = Column(String(255), default="", index=True)
    payment_intent = Column(String(255), default="")
    amount = Column(Numeric(14, 2), default=0)
    currency = Column(String(5), default="EUR")
    status = Column(String(40), default="pending", index=True)
    raw_event = Column(JSON, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    def to_dict(self):
        return {
            "id": self.id, "order_id": self.order_id, "provider": self.provider,
            "session_id": self.session_id, "payment_intent": self.payment_intent,
            "amount": float(self.amount or 0), "currency": self.currency, "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Setting(Base):
    __tablename__ = "settings"
    key = Column(String(80), primary_key=True)
    value = Column(JSON, default=dict)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)


class PromoCode(Base):
    __tablename__ = "promo_codes"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    code = Column(String(60), unique=True, nullable=False, index=True)
    description = Column(Text, default="")
    discount_type = Column(String(20), default="percent")
    value = Column(Numeric(12, 2), default=0)
    min_subtotal_eur = Column(Numeric(12, 2), default=0)
    free_shipping = Column(Boolean, default=False)
    first_order_only = Column(Boolean, default=False)
    usage_limit = Column(Integer, nullable=True)
    used_count = Column(Integer, default=0)
    starts_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    active = Column(Boolean, default=True, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    def to_dict(self):
        return {
            "id": self.id, "code": self.code, "description": self.description,
            "discount_type": self.discount_type, "value": float(self.value or 0),
            "min_subtotal_eur": float(self.min_subtotal_eur or 0), "free_shipping": self.free_shipping,
            "first_order_only": self.first_order_only, "usage_limit": self.usage_limit,
            "used_count": self.used_count or 0,
            "starts_at": self.starts_at.isoformat() if self.starts_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "active": self.active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class MediaFile(Base):
    __tablename__ = "media_files"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    storage_path = Column(Text, nullable=False, index=True)
    original_filename = Column(String(255), default="")
    content_type = Column(String(120), default="")
    kind = Column(String(20), default="image", index=True)
    size = Column(Integer, default=0)
    is_deleted = Column(Boolean, default=False, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    def to_dict(self):
        return {
            "id": self.id, "storage_path": self.storage_path, "original_filename": self.original_filename,
            "content_type": self.content_type, "kind": self.kind, "size": self.size,
            "url": f"/api/media/{self.storage_path}",
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class EmailLog(Base):
    __tablename__ = "email_logs"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    to_email = Column(String(255), default="", index=True)
    subject = Column(Text, default="")
    template = Column(String(60), default="", index=True)
    order_id = Column(String(36), nullable=True, index=True)
    status = Column(String(20), default="sent", index=True)
    provider_id = Column(String(120), default="")
    error = Column(Text, default="")
    created_at = Column(DateTime(timezone=True), default=utcnow)

    def to_dict(self):
        return {
            "id": self.id, "to_email": self.to_email, "subject": self.subject, "template": self.template,
            "order_id": self.order_id, "status": self.status, "provider_id": self.provider_id,
            "error": self.error, "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    token_hash = Column(String(128), unique=True, nullable=False, index=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)


class Review(Base):
    __tablename__ = "reviews"
    __table_args__ = (UniqueConstraint("user_id", "product_id", name="uq_review_user_product"),)
    id = Column(String(36), primary_key=True, default=gen_uuid)
    product_id = Column(String(36), ForeignKey("products.id", ondelete="CASCADE"), index=True)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    author_name = Column(String(120), default="")
    rating = Column(Integer, default=5)
    title = Column(String(160), default="")
    body = Column(Text, default="")
    images = Column(JSON, default=list)
    verified_purchase = Column(Boolean, default=False)
    approved = Column(Boolean, default=True, index=True)
    admin_reply = Column(Text, default="")
    admin_reply_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    edited_at = Column(DateTime(timezone=True), nullable=True)

    def to_dict(self, admin=False):
        can_edit = False
        if self.created_at:
            age = datetime.now(timezone.utc) - self.created_at
            can_edit = age.days < 14
        d = {
            "id": self.id, "product_id": self.product_id, "author_name": self.author_name,
            "rating": self.rating, "title": self.title, "body": self.body,
            "images": self.images or [], "verified_purchase": self.verified_purchase,
            "approved": self.approved, "created_at": self.created_at.isoformat() if self.created_at else None,
            "edited_at": self.edited_at.isoformat() if self.edited_at else None,
            "is_edited": bool(self.edited_at),
            "can_edit": can_edit,
            "admin_reply": self.admin_reply or "",
            "admin_reply_at": self.admin_reply_at.isoformat() if self.admin_reply_at else None,
        }
        if admin:
            d["user_id"] = self.user_id
        return d


class NewsletterSubscriber(Base):
    __tablename__ = "newsletter_subscribers"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    email = Column(String(255), unique=True, nullable=False, index=True)
    user_id = Column(String(36), nullable=True, index=True)
    lang = Column(String(5), default="fr")
    token = Column(String(64), unique=True, nullable=False, index=True)
    active = Column(Boolean, default=True, index=True)
    source = Column(String(40), default="footer")
    created_at = Column(DateTime(timezone=True), default=utcnow)
    unsubscribed_at = Column(DateTime(timezone=True), nullable=True)

    def to_dict(self):
        return {
            "id": self.id, "email": self.email, "user_id": self.user_id, "lang": self.lang, "active": self.active,
            "source": self.source, "created_at": self.created_at.isoformat() if self.created_at else None,
            "unsubscribed_at": self.unsubscribed_at.isoformat() if self.unsubscribed_at else None,
        }


class NewsletterCampaign(Base):
    __tablename__ = "newsletter_campaigns"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(160), default="")
    subject_fr = Column(String(200), default="")
    subject_en = Column(String(200), default="")
    body_fr = Column(Text, default="")
    body_en = Column(Text, default="")
    product_slugs = Column(JSON, default=list)
    cta_link = Column(String(300), default="/catalog?is_new=true")
    cta_fr = Column(String(80), default="Decouvrir")
    cta_en = Column(String(80), default="Shop now")
    status = Column(String(20), default="draft", index=True)
    sent_count = Column(Integer, default=0)
    failed_count = Column(Integer, default=0)
    total_recipients = Column(Integer, default=0)
    sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    def to_dict(self):
        return {
            "id": self.id, "name": self.name, "subject_fr": self.subject_fr, "subject_en": self.subject_en,
            "body_fr": self.body_fr, "body_en": self.body_en, "product_slugs": self.product_slugs or [],
            "cta_link": self.cta_link, "cta_fr": self.cta_fr, "cta_en": self.cta_en, "status": self.status,
            "sent_count": self.sent_count or 0, "failed_count": self.failed_count or 0,
            "total_recipients": self.total_recipients or 0,
            "sent_at": self.sent_at.isoformat() if self.sent_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ContactMessage(Base):
    __tablename__ = "contact_messages"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    name = Column(String(120), nullable=False)
    email = Column(String(255), nullable=False, index=True)
    subject = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    lang = Column(String(5), default="fr")
    status = Column(String(20), default="new", index=True)
    user_id = Column(String(36), nullable=True, index=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)
    read_at = Column(DateTime(timezone=True), nullable=True)
    replied_at = Column(DateTime(timezone=True), nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "subject": self.subject,
            "message": self.message,
            "lang": self.lang,
            "status": self.status,
            "user_id": self.user_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "read_at": self.read_at.isoformat() if self.read_at else None,
            "replied_at": self.replied_at.isoformat() if self.replied_at else None,
        }


class EmailChangeRequest(Base):
    __tablename__ = "email_change_requests"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    old_email = Column(String(255), nullable=False)
    new_email = Column(String(255), nullable=False, index=True)
    old_token_hash = Column(String(128), nullable=False, index=True)
    new_token_hash = Column(String(128), nullable=False, index=True)
    old_confirmed_at = Column(DateTime(timezone=True), nullable=True)
    new_confirmed_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)
    cancelled_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "old_email": self.old_email,
            "new_email": self.new_email,
            "old_confirmed_at": self.old_confirmed_at.isoformat() if self.old_confirmed_at else None,
            "new_confirmed_at": self.new_confirmed_at.isoformat() if self.new_confirmed_at else None,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "used_at": self.used_at.isoformat() if self.used_at else None,
            "cancelled_at": self.cancelled_at.isoformat() if self.cancelled_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Cart(Base):
    __tablename__ = "carts"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    user_id = Column(String(36), ForeignKey("profiles.id", ondelete="CASCADE"), unique=True, index=True, nullable=False)
    items = Column(JSON, default=list)
    subtotal_eur = Column(Numeric(14, 2), default=0)
    email_1_sent_at = Column(DateTime(timezone=True), nullable=True, index=True)
    email_2_sent_at = Column(DateTime(timezone=True), nullable=True, index=True)
    reminder_opt_out = Column(Boolean, default=False)
    recovered_order_id = Column(String(36), nullable=True)
    promo_code_used = Column(String(60), default="")
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "items": self.items or [],
            "subtotal_eur": float(self.subtotal_eur or 0),
            "email_1_sent_at": self.email_1_sent_at.isoformat() if self.email_1_sent_at else None,
            "email_2_sent_at": self.email_2_sent_at.isoformat() if self.email_2_sent_at else None,
            "reminder_opt_out": bool(self.reminder_opt_out),
            "recovered_order_id": self.recovered_order_id,
            "promo_code_used": self.promo_code_used or "",
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# ⭐ NOUVEAU : messagerie de réclamation (chat client ↔ admin)
class ClaimMessage(Base):
    __tablename__ = "claim_messages"
    id = Column(String(36), primary_key=True, default=gen_uuid)
    order_id = Column(String(36), ForeignKey("orders.id", ondelete="CASCADE"), index=True)
    sender = Column(String(10), nullable=False)              # "client" | "admin"
    sender_email = Column(String(255), default="")
    text = Column(Text, default="")
    # ⭐ Médias joints : [{"type": "image"|"video", "url": "..."}]
    media_urls = Column(JSON, default=list)
    # ⭐ Quand l'admin demande, on précise quels types il demande
    requested_types = Column(JSON, default=list)             # ["photo", "video"]
    created_at = Column(DateTime(timezone=True), default=utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "order_id": self.order_id,
            "sender": self.sender,
            "sender_email": self.sender_email,
            "text": self.text or "",
            "media_urls": self.media_urls or [],
            "requested_types": self.requested_types or [],
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }