// Code generated by protoc-gen-go. DO NOT EDIT.
// versions:
// 	protoc-gen-go v1.36.4
// 	protoc        v5.29.3
// source: 40swapd.proto

package rpc

import (
	protoreflect "google.golang.org/protobuf/reflect/protoreflect"
	protoimpl "google.golang.org/protobuf/runtime/protoimpl"
	reflect "reflect"
	sync "sync"
	unsafe "unsafe"
)

const (
	// Verify that this generated code is sufficiently up-to-date.
	_ = protoimpl.EnforceVersion(20 - protoimpl.MinVersion)
	// Verify that runtime/protoimpl is sufficiently up-to-date.
	_ = protoimpl.EnforceVersion(protoimpl.MaxVersion - 20)
)

// Enum definition
type Chain int32

const (
	Chain_BITCOIN Chain = 0
	Chain_LIQUID  Chain = 1
)

// Enum value maps for Chain.
var (
	Chain_name = map[int32]string{
		0: "BITCOIN",
		1: "LIQUID",
	}
	Chain_value = map[string]int32{
		"BITCOIN": 0,
		"LIQUID":  1,
	}
)

func (x Chain) Enum() *Chain {
	p := new(Chain)
	*p = x
	return p
}

func (x Chain) String() string {
	return protoimpl.X.EnumStringOf(x.Descriptor(), protoreflect.EnumNumber(x))
}

func (Chain) Descriptor() protoreflect.EnumDescriptor {
	return file__40swapd_proto_enumTypes[0].Descriptor()
}

func (Chain) Type() protoreflect.EnumType {
	return &file__40swapd_proto_enumTypes[0]
}

func (x Chain) Number() protoreflect.EnumNumber {
	return protoreflect.EnumNumber(x)
}

// Deprecated: Use Chain.Descriptor instead.
func (Chain) EnumDescriptor() ([]byte, []int) {
	return file__40swapd_proto_rawDescGZIP(), []int{0}
}

type Network int32

const (
	Network_MAINNET Network = 0
	Network_TESTNET Network = 1
	Network_REGTEST Network = 2
)

// Enum value maps for Network.
var (
	Network_name = map[int32]string{
		0: "MAINNET",
		1: "TESTNET",
		2: "REGTEST",
	}
	Network_value = map[string]int32{
		"MAINNET": 0,
		"TESTNET": 1,
		"REGTEST": 2,
	}
)

func (x Network) Enum() *Network {
	p := new(Network)
	*p = x
	return p
}

func (x Network) String() string {
	return protoimpl.X.EnumStringOf(x.Descriptor(), protoreflect.EnumNumber(x))
}

func (Network) Descriptor() protoreflect.EnumDescriptor {
	return file__40swapd_proto_enumTypes[1].Descriptor()
}

func (Network) Type() protoreflect.EnumType {
	return &file__40swapd_proto_enumTypes[1]
}

func (x Network) Number() protoreflect.EnumNumber {
	return protoreflect.EnumNumber(x)
}

// Deprecated: Use Network.Descriptor instead.
func (Network) EnumDescriptor() ([]byte, []int) {
	return file__40swapd_proto_rawDescGZIP(), []int{1}
}

// Message definitions
type SwapInRequest struct {
	state         protoimpl.MessageState `protogen:"open.v1"`
	Chain         Chain                  `protobuf:"varint,1,opt,name=chain,proto3,enum=Chain" json:"chain,omitempty"`
	Invoice       *string                `protobuf:"bytes,2,opt,name=invoice,proto3,oneof" json:"invoice,omitempty"`
	AmountSats    *uint32                `protobuf:"varint,3,opt,name=amountSats,proto3,oneof" json:"amountSats,omitempty"`
	Expiry        *uint32                `protobuf:"varint,4,opt,name=expiry,proto3,oneof" json:"expiry,omitempty"`
	RefundTo      string                 `protobuf:"bytes,5,opt,name=refund_to,json=refundTo,proto3" json:"refund_to,omitempty"`
	unknownFields protoimpl.UnknownFields
	sizeCache     protoimpl.SizeCache
}

func (x *SwapInRequest) Reset() {
	*x = SwapInRequest{}
	mi := &file__40swapd_proto_msgTypes[0]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *SwapInRequest) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*SwapInRequest) ProtoMessage() {}

func (x *SwapInRequest) ProtoReflect() protoreflect.Message {
	mi := &file__40swapd_proto_msgTypes[0]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use SwapInRequest.ProtoReflect.Descriptor instead.
func (*SwapInRequest) Descriptor() ([]byte, []int) {
	return file__40swapd_proto_rawDescGZIP(), []int{0}
}

func (x *SwapInRequest) GetChain() Chain {
	if x != nil {
		return x.Chain
	}
	return Chain_BITCOIN
}

func (x *SwapInRequest) GetInvoice() string {
	if x != nil && x.Invoice != nil {
		return *x.Invoice
	}
	return ""
}

func (x *SwapInRequest) GetAmountSats() uint32 {
	if x != nil && x.AmountSats != nil {
		return *x.AmountSats
	}
	return 0
}

func (x *SwapInRequest) GetExpiry() uint32 {
	if x != nil && x.Expiry != nil {
		return *x.Expiry
	}
	return 0
}

func (x *SwapInRequest) GetRefundTo() string {
	if x != nil {
		return x.RefundTo
	}
	return ""
}

type SwapInResponse struct {
	state         protoimpl.MessageState `protogen:"open.v1"`
	SwapId        string                 `protobuf:"bytes,1,opt,name=swapId,proto3" json:"swapId,omitempty"`
	ClaimAddress  string                 `protobuf:"bytes,2,opt,name=claim_address,json=claimAddress,proto3" json:"claim_address,omitempty"`
	unknownFields protoimpl.UnknownFields
	sizeCache     protoimpl.SizeCache
}

func (x *SwapInResponse) Reset() {
	*x = SwapInResponse{}
	mi := &file__40swapd_proto_msgTypes[1]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *SwapInResponse) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*SwapInResponse) ProtoMessage() {}

func (x *SwapInResponse) ProtoReflect() protoreflect.Message {
	mi := &file__40swapd_proto_msgTypes[1]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use SwapInResponse.ProtoReflect.Descriptor instead.
func (*SwapInResponse) Descriptor() ([]byte, []int) {
	return file__40swapd_proto_rawDescGZIP(), []int{1}
}

func (x *SwapInResponse) GetSwapId() string {
	if x != nil {
		return x.SwapId
	}
	return ""
}

func (x *SwapInResponse) GetClaimAddress() string {
	if x != nil {
		return x.ClaimAddress
	}
	return ""
}

type SwapOutRequest struct {
	state protoimpl.MessageState `protogen:"open.v1"`
	Chain Chain                  `protobuf:"varint,1,opt,name=chain,proto3,enum=Chain" json:"chain,omitempty"`
	// Amount in satoshis
	AmountSats uint32 `protobuf:"varint,2,opt,name=amountSats,proto3" json:"amountSats,omitempty"`
	// Optional Destination address
	Address       string `protobuf:"bytes,3,opt,name=address,proto3" json:"address,omitempty"`
	unknownFields protoimpl.UnknownFields
	sizeCache     protoimpl.SizeCache
}

func (x *SwapOutRequest) Reset() {
	*x = SwapOutRequest{}
	mi := &file__40swapd_proto_msgTypes[2]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *SwapOutRequest) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*SwapOutRequest) ProtoMessage() {}

func (x *SwapOutRequest) ProtoReflect() protoreflect.Message {
	mi := &file__40swapd_proto_msgTypes[2]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use SwapOutRequest.ProtoReflect.Descriptor instead.
func (*SwapOutRequest) Descriptor() ([]byte, []int) {
	return file__40swapd_proto_rawDescGZIP(), []int{2}
}

func (x *SwapOutRequest) GetChain() Chain {
	if x != nil {
		return x.Chain
	}
	return Chain_BITCOIN
}

func (x *SwapOutRequest) GetAmountSats() uint32 {
	if x != nil {
		return x.AmountSats
	}
	return 0
}

func (x *SwapOutRequest) GetAddress() string {
	if x != nil {
		return x.Address
	}
	return ""
}

type SwapOutResponse struct {
	state         protoimpl.MessageState `protogen:"open.v1"`
	unknownFields protoimpl.UnknownFields
	sizeCache     protoimpl.SizeCache
}

func (x *SwapOutResponse) Reset() {
	*x = SwapOutResponse{}
	mi := &file__40swapd_proto_msgTypes[3]
	ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
	ms.StoreMessageInfo(mi)
}

func (x *SwapOutResponse) String() string {
	return protoimpl.X.MessageStringOf(x)
}

func (*SwapOutResponse) ProtoMessage() {}

func (x *SwapOutResponse) ProtoReflect() protoreflect.Message {
	mi := &file__40swapd_proto_msgTypes[3]
	if x != nil {
		ms := protoimpl.X.MessageStateOf(protoimpl.Pointer(x))
		if ms.LoadMessageInfo() == nil {
			ms.StoreMessageInfo(mi)
		}
		return ms
	}
	return mi.MessageOf(x)
}

// Deprecated: Use SwapOutResponse.ProtoReflect.Descriptor instead.
func (*SwapOutResponse) Descriptor() ([]byte, []int) {
	return file__40swapd_proto_rawDescGZIP(), []int{3}
}

var File__40swapd_proto protoreflect.FileDescriptor

var file__40swapd_proto_rawDesc = string([]byte{
	0x0a, 0x0d, 0x34, 0x30, 0x73, 0x77, 0x61, 0x70, 0x64, 0x2e, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x22,
	0xd1, 0x01, 0x0a, 0x0d, 0x53, 0x77, 0x61, 0x70, 0x49, 0x6e, 0x52, 0x65, 0x71, 0x75, 0x65, 0x73,
	0x74, 0x12, 0x1c, 0x0a, 0x05, 0x63, 0x68, 0x61, 0x69, 0x6e, 0x18, 0x01, 0x20, 0x01, 0x28, 0x0e,
	0x32, 0x06, 0x2e, 0x43, 0x68, 0x61, 0x69, 0x6e, 0x52, 0x05, 0x63, 0x68, 0x61, 0x69, 0x6e, 0x12,
	0x1d, 0x0a, 0x07, 0x69, 0x6e, 0x76, 0x6f, 0x69, 0x63, 0x65, 0x18, 0x02, 0x20, 0x01, 0x28, 0x09,
	0x48, 0x00, 0x52, 0x07, 0x69, 0x6e, 0x76, 0x6f, 0x69, 0x63, 0x65, 0x88, 0x01, 0x01, 0x12, 0x23,
	0x0a, 0x0a, 0x61, 0x6d, 0x6f, 0x75, 0x6e, 0x74, 0x53, 0x61, 0x74, 0x73, 0x18, 0x03, 0x20, 0x01,
	0x28, 0x0d, 0x48, 0x01, 0x52, 0x0a, 0x61, 0x6d, 0x6f, 0x75, 0x6e, 0x74, 0x53, 0x61, 0x74, 0x73,
	0x88, 0x01, 0x01, 0x12, 0x1b, 0x0a, 0x06, 0x65, 0x78, 0x70, 0x69, 0x72, 0x79, 0x18, 0x04, 0x20,
	0x01, 0x28, 0x0d, 0x48, 0x02, 0x52, 0x06, 0x65, 0x78, 0x70, 0x69, 0x72, 0x79, 0x88, 0x01, 0x01,
	0x12, 0x1b, 0x0a, 0x09, 0x72, 0x65, 0x66, 0x75, 0x6e, 0x64, 0x5f, 0x74, 0x6f, 0x18, 0x05, 0x20,
	0x01, 0x28, 0x09, 0x52, 0x08, 0x72, 0x65, 0x66, 0x75, 0x6e, 0x64, 0x54, 0x6f, 0x42, 0x0a, 0x0a,
	0x08, 0x5f, 0x69, 0x6e, 0x76, 0x6f, 0x69, 0x63, 0x65, 0x42, 0x0d, 0x0a, 0x0b, 0x5f, 0x61, 0x6d,
	0x6f, 0x75, 0x6e, 0x74, 0x53, 0x61, 0x74, 0x73, 0x42, 0x09, 0x0a, 0x07, 0x5f, 0x65, 0x78, 0x70,
	0x69, 0x72, 0x79, 0x22, 0x4d, 0x0a, 0x0e, 0x53, 0x77, 0x61, 0x70, 0x49, 0x6e, 0x52, 0x65, 0x73,
	0x70, 0x6f, 0x6e, 0x73, 0x65, 0x12, 0x16, 0x0a, 0x06, 0x73, 0x77, 0x61, 0x70, 0x49, 0x64, 0x18,
	0x01, 0x20, 0x01, 0x28, 0x09, 0x52, 0x06, 0x73, 0x77, 0x61, 0x70, 0x49, 0x64, 0x12, 0x23, 0x0a,
	0x0d, 0x63, 0x6c, 0x61, 0x69, 0x6d, 0x5f, 0x61, 0x64, 0x64, 0x72, 0x65, 0x73, 0x73, 0x18, 0x02,
	0x20, 0x01, 0x28, 0x09, 0x52, 0x0c, 0x63, 0x6c, 0x61, 0x69, 0x6d, 0x41, 0x64, 0x64, 0x72, 0x65,
	0x73, 0x73, 0x22, 0x68, 0x0a, 0x0e, 0x53, 0x77, 0x61, 0x70, 0x4f, 0x75, 0x74, 0x52, 0x65, 0x71,
	0x75, 0x65, 0x73, 0x74, 0x12, 0x1c, 0x0a, 0x05, 0x63, 0x68, 0x61, 0x69, 0x6e, 0x18, 0x01, 0x20,
	0x01, 0x28, 0x0e, 0x32, 0x06, 0x2e, 0x43, 0x68, 0x61, 0x69, 0x6e, 0x52, 0x05, 0x63, 0x68, 0x61,
	0x69, 0x6e, 0x12, 0x1e, 0x0a, 0x0a, 0x61, 0x6d, 0x6f, 0x75, 0x6e, 0x74, 0x53, 0x61, 0x74, 0x73,
	0x18, 0x02, 0x20, 0x01, 0x28, 0x0d, 0x52, 0x0a, 0x61, 0x6d, 0x6f, 0x75, 0x6e, 0x74, 0x53, 0x61,
	0x74, 0x73, 0x12, 0x18, 0x0a, 0x07, 0x61, 0x64, 0x64, 0x72, 0x65, 0x73, 0x73, 0x18, 0x03, 0x20,
	0x01, 0x28, 0x09, 0x52, 0x07, 0x61, 0x64, 0x64, 0x72, 0x65, 0x73, 0x73, 0x22, 0x11, 0x0a, 0x0f,
	0x53, 0x77, 0x61, 0x70, 0x4f, 0x75, 0x74, 0x52, 0x65, 0x73, 0x70, 0x6f, 0x6e, 0x73, 0x65, 0x2a,
	0x20, 0x0a, 0x05, 0x43, 0x68, 0x61, 0x69, 0x6e, 0x12, 0x0b, 0x0a, 0x07, 0x42, 0x49, 0x54, 0x43,
	0x4f, 0x49, 0x4e, 0x10, 0x00, 0x12, 0x0a, 0x0a, 0x06, 0x4c, 0x49, 0x51, 0x55, 0x49, 0x44, 0x10,
	0x01, 0x2a, 0x30, 0x0a, 0x07, 0x4e, 0x65, 0x74, 0x77, 0x6f, 0x72, 0x6b, 0x12, 0x0b, 0x0a, 0x07,
	0x4d, 0x41, 0x49, 0x4e, 0x4e, 0x45, 0x54, 0x10, 0x00, 0x12, 0x0b, 0x0a, 0x07, 0x54, 0x45, 0x53,
	0x54, 0x4e, 0x45, 0x54, 0x10, 0x01, 0x12, 0x0b, 0x0a, 0x07, 0x52, 0x45, 0x47, 0x54, 0x45, 0x53,
	0x54, 0x10, 0x02, 0x32, 0x66, 0x0a, 0x0b, 0x53, 0x77, 0x61, 0x70, 0x53, 0x65, 0x72, 0x76, 0x69,
	0x63, 0x65, 0x12, 0x29, 0x0a, 0x06, 0x53, 0x77, 0x61, 0x70, 0x49, 0x6e, 0x12, 0x0e, 0x2e, 0x53,
	0x77, 0x61, 0x70, 0x49, 0x6e, 0x52, 0x65, 0x71, 0x75, 0x65, 0x73, 0x74, 0x1a, 0x0f, 0x2e, 0x53,
	0x77, 0x61, 0x70, 0x49, 0x6e, 0x52, 0x65, 0x73, 0x70, 0x6f, 0x6e, 0x73, 0x65, 0x12, 0x2c, 0x0a,
	0x07, 0x53, 0x77, 0x61, 0x70, 0x4f, 0x75, 0x74, 0x12, 0x0f, 0x2e, 0x53, 0x77, 0x61, 0x70, 0x4f,
	0x75, 0x74, 0x52, 0x65, 0x71, 0x75, 0x65, 0x73, 0x74, 0x1a, 0x10, 0x2e, 0x53, 0x77, 0x61, 0x70,
	0x4f, 0x75, 0x74, 0x52, 0x65, 0x73, 0x70, 0x6f, 0x6e, 0x73, 0x65, 0x42, 0x07, 0x5a, 0x05, 0x2e,
	0x2f, 0x72, 0x70, 0x63, 0x62, 0x06, 0x70, 0x72, 0x6f, 0x74, 0x6f, 0x33,
})

var (
	file__40swapd_proto_rawDescOnce sync.Once
	file__40swapd_proto_rawDescData []byte
)

func file__40swapd_proto_rawDescGZIP() []byte {
	file__40swapd_proto_rawDescOnce.Do(func() {
		file__40swapd_proto_rawDescData = protoimpl.X.CompressGZIP(unsafe.Slice(unsafe.StringData(file__40swapd_proto_rawDesc), len(file__40swapd_proto_rawDesc)))
	})
	return file__40swapd_proto_rawDescData
}

var file__40swapd_proto_enumTypes = make([]protoimpl.EnumInfo, 2)
var file__40swapd_proto_msgTypes = make([]protoimpl.MessageInfo, 4)
var file__40swapd_proto_goTypes = []any{
	(Chain)(0),              // 0: Chain
	(Network)(0),            // 1: Network
	(*SwapInRequest)(nil),   // 2: SwapInRequest
	(*SwapInResponse)(nil),  // 3: SwapInResponse
	(*SwapOutRequest)(nil),  // 4: SwapOutRequest
	(*SwapOutResponse)(nil), // 5: SwapOutResponse
}
var file__40swapd_proto_depIdxs = []int32{
	0, // 0: SwapInRequest.chain:type_name -> Chain
	0, // 1: SwapOutRequest.chain:type_name -> Chain
	2, // 2: SwapService.SwapIn:input_type -> SwapInRequest
	4, // 3: SwapService.SwapOut:input_type -> SwapOutRequest
	3, // 4: SwapService.SwapIn:output_type -> SwapInResponse
	5, // 5: SwapService.SwapOut:output_type -> SwapOutResponse
	4, // [4:6] is the sub-list for method output_type
	2, // [2:4] is the sub-list for method input_type
	2, // [2:2] is the sub-list for extension type_name
	2, // [2:2] is the sub-list for extension extendee
	0, // [0:2] is the sub-list for field type_name
}

func init() { file__40swapd_proto_init() }
func file__40swapd_proto_init() {
	if File__40swapd_proto != nil {
		return
	}
	file__40swapd_proto_msgTypes[0].OneofWrappers = []any{}
	type x struct{}
	out := protoimpl.TypeBuilder{
		File: protoimpl.DescBuilder{
			GoPackagePath: reflect.TypeOf(x{}).PkgPath(),
			RawDescriptor: unsafe.Slice(unsafe.StringData(file__40swapd_proto_rawDesc), len(file__40swapd_proto_rawDesc)),
			NumEnums:      2,
			NumMessages:   4,
			NumExtensions: 0,
			NumServices:   1,
		},
		GoTypes:           file__40swapd_proto_goTypes,
		DependencyIndexes: file__40swapd_proto_depIdxs,
		EnumInfos:         file__40swapd_proto_enumTypes,
		MessageInfos:      file__40swapd_proto_msgTypes,
	}.Build()
	File__40swapd_proto = out.File
	file__40swapd_proto_goTypes = nil
	file__40swapd_proto_depIdxs = nil
}
