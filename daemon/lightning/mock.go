// Code generated by MockGen. DO NOT EDIT.
// Source: github.com/40acres/40swap/daemon/lightning (interfaces: Client)
//
// Generated by this command:
//
//	mockgen -destination=mock.go -package=lightning . Client
//

// Package lightning is a generated GoMock package.
package lightning

import (
	context "context"
	reflect "reflect"
	time "time"

	lnrpc "github.com/lightningnetwork/lnd/lnrpc"
	decimal "github.com/shopspring/decimal"
	gomock "go.uber.org/mock/gomock"
)

// MockClient is a mock of Client interface.
type MockClient struct {
	ctrl     *gomock.Controller
	recorder *MockClientMockRecorder
	isgomock struct{}
}

// MockClientMockRecorder is the mock recorder for MockClient.
type MockClientMockRecorder struct {
	mock *MockClient
}

// NewMockClient creates a new mock instance.
func NewMockClient(ctrl *gomock.Controller) *MockClient {
	mock := &MockClient{ctrl: ctrl}
	mock.recorder = &MockClientMockRecorder{mock}
	return mock
}

// EXPECT returns an object that allows the caller to indicate expected use.
func (m *MockClient) EXPECT() *MockClientMockRecorder {
	return m.recorder
}

// GenerateAddress mocks base method.
func (m *MockClient) GenerateAddress(ctx context.Context) (string, error) {
	m.ctrl.T.Helper()
	ret := m.ctrl.Call(m, "GenerateAddress", ctx)
	ret0, _ := ret[0].(string)
	ret1, _ := ret[1].(error)
	return ret0, ret1
}

// GenerateAddress indicates an expected call of GenerateAddress.
func (mr *MockClientMockRecorder) GenerateAddress(ctx any) *gomock.Call {
	mr.mock.ctrl.T.Helper()
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "GenerateAddress", reflect.TypeOf((*MockClient)(nil).GenerateAddress), ctx)
}

// GenerateInvoice mocks base method.
func (m *MockClient) GenerateInvoice(ctx context.Context, amountSats decimal.Decimal, expiry time.Duration, memo string) (string, []byte, error) {
	m.ctrl.T.Helper()
	ret := m.ctrl.Call(m, "GenerateInvoice", ctx, amountSats, expiry, memo)
	ret0, _ := ret[0].(string)
	ret1, _ := ret[1].([]byte)
	ret2, _ := ret[2].(error)
	return ret0, ret1, ret2
}

// GenerateInvoice indicates an expected call of GenerateInvoice.
func (mr *MockClientMockRecorder) GenerateInvoice(ctx, amountSats, expiry, memo any) *gomock.Call {
	mr.mock.ctrl.T.Helper()
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "GenerateInvoice", reflect.TypeOf((*MockClient)(nil).GenerateInvoice), ctx, amountSats, expiry, memo)
}

// GetChannelLocalBalance mocks base method.
func (m *MockClient) GetChannelLocalBalance(ctx context.Context) (decimal.Decimal, error) {
	m.ctrl.T.Helper()
	ret := m.ctrl.Call(m, "GetChannelLocalBalance", ctx)
	ret0, _ := ret[0].(decimal.Decimal)
	ret1, _ := ret[1].(error)
	return ret0, ret1
}

// GetChannelLocalBalance indicates an expected call of GetChannelLocalBalance.
func (mr *MockClientMockRecorder) GetChannelLocalBalance(ctx any) *gomock.Call {
	mr.mock.ctrl.T.Helper()
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "GetChannelLocalBalance", reflect.TypeOf((*MockClient)(nil).GetChannelLocalBalance), ctx)
}

// GetInfo mocks base method.
func (m *MockClient) GetInfo(ctx context.Context) (*lnrpc.GetInfoResponse, error) {
	m.ctrl.T.Helper()
	ret := m.ctrl.Call(m, "GetInfo", ctx)
	ret0, _ := ret[0].(*lnrpc.GetInfoResponse)
	ret1, _ := ret[1].(error)
	return ret0, ret1
}

// GetInfo indicates an expected call of GetInfo.
func (mr *MockClientMockRecorder) GetInfo(ctx any) *gomock.Call {
	mr.mock.ctrl.T.Helper()
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "GetInfo", reflect.TypeOf((*MockClient)(nil).GetInfo), ctx)
}

// MonitorPaymentReception mocks base method.
func (m *MockClient) MonitorPaymentReception(ctx context.Context, rhash []byte) (Preimage, error) {
	m.ctrl.T.Helper()
	ret := m.ctrl.Call(m, "MonitorPaymentReception", ctx, rhash)
	ret0, _ := ret[0].(Preimage)
	ret1, _ := ret[1].(error)
	return ret0, ret1
}

// MonitorPaymentReception indicates an expected call of MonitorPaymentReception.
func (mr *MockClientMockRecorder) MonitorPaymentReception(ctx, rhash any) *gomock.Call {
	mr.mock.ctrl.T.Helper()
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "MonitorPaymentReception", reflect.TypeOf((*MockClient)(nil).MonitorPaymentReception), ctx, rhash)
}

// MonitorPaymentRequest mocks base method.
func (m *MockClient) MonitorPaymentRequest(ctx context.Context, paymentHash string) (Preimage, NetworkFeeSats, error) {
	m.ctrl.T.Helper()
	ret := m.ctrl.Call(m, "MonitorPaymentRequest", ctx, paymentHash)
	ret0, _ := ret[0].(Preimage)
	ret1, _ := ret[1].(NetworkFeeSats)
	ret2, _ := ret[2].(error)
	return ret0, ret1, ret2
}

// MonitorPaymentRequest indicates an expected call of MonitorPaymentRequest.
func (mr *MockClientMockRecorder) MonitorPaymentRequest(ctx, paymentHash any) *gomock.Call {
	mr.mock.ctrl.T.Helper()
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "MonitorPaymentRequest", reflect.TypeOf((*MockClient)(nil).MonitorPaymentRequest), ctx, paymentHash)
}

// PayInvoice mocks base method.
func (m *MockClient) PayInvoice(ctx context.Context, paymentRequest string, feeLimitRatio float64) error {
	m.ctrl.T.Helper()
	ret := m.ctrl.Call(m, "PayInvoice", ctx, paymentRequest, feeLimitRatio)
	ret0, _ := ret[0].(error)
	return ret0
}

// PayInvoice indicates an expected call of PayInvoice.
func (mr *MockClientMockRecorder) PayInvoice(ctx, paymentRequest, feeLimitRatio any) *gomock.Call {
	mr.mock.ctrl.T.Helper()
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "PayInvoice", reflect.TypeOf((*MockClient)(nil).PayInvoice), ctx, paymentRequest, feeLimitRatio)
}
