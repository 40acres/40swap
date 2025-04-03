// Code generated by MockGen. DO NOT EDIT.
// Source: github.com/40acres/40swap/daemon/rpc (interfaces: Repository)
//
// Generated by this command:
//
//	mockgen -destination=mock_repository.go -package=rpc . Repository
//

// Package rpc is a generated GoMock package.
package rpc

import (
	reflect "reflect"

	models "github.com/40acres/40swap/daemon/database/models"
	gomock "go.uber.org/mock/gomock"
)

// MockRepository is a mock of Repository interface.
type MockRepository struct {
	ctrl     *gomock.Controller
	recorder *MockRepositoryMockRecorder
	isgomock struct{}
}

// MockRepositoryMockRecorder is the mock recorder for MockRepository.
type MockRepositoryMockRecorder struct {
	mock *MockRepository
}

// NewMockRepository creates a new mock instance.
func NewMockRepository(ctrl *gomock.Controller) *MockRepository {
	mock := &MockRepository{ctrl: ctrl}
	mock.recorder = &MockRepositoryMockRecorder{mock}
	return mock
}

// EXPECT returns an object that allows the caller to indicate expected use.
func (m *MockRepository) EXPECT() *MockRepositoryMockRecorder {
	return m.recorder
}

// GetPendingSwapIns mocks base method.
func (m *MockRepository) GetPendingSwapIns() ([]models.SwapIn, error) {
	m.ctrl.T.Helper()
	ret := m.ctrl.Call(m, "GetPendingSwapIns")
	ret0, _ := ret[0].([]models.SwapIn)
	ret1, _ := ret[1].(error)
	return ret0, ret1
}

// GetPendingSwapIns indicates an expected call of GetPendingSwapIns.
func (mr *MockRepositoryMockRecorder) GetPendingSwapIns() *gomock.Call {
	mr.mock.ctrl.T.Helper()
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "GetPendingSwapIns", reflect.TypeOf((*MockRepository)(nil).GetPendingSwapIns))
}

// SaveSwapIn mocks base method.
func (m *MockRepository) SaveSwapIn(swapIn *models.SwapIn) error {
	m.ctrl.T.Helper()
	ret := m.ctrl.Call(m, "SaveSwapIn", swapIn)
	ret0, _ := ret[0].(error)
	return ret0
}

// SaveSwapIn indicates an expected call of SaveSwapIn.
func (mr *MockRepositoryMockRecorder) SaveSwapIn(swapIn any) *gomock.Call {
	mr.mock.ctrl.T.Helper()
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "SaveSwapIn", reflect.TypeOf((*MockRepository)(nil).SaveSwapIn), swapIn)
}

// SaveSwapOut mocks base method.
func (m *MockRepository) SaveSwapOut(swapOut *models.SwapOut) error {
	m.ctrl.T.Helper()
	ret := m.ctrl.Call(m, "SaveSwapOut", swapOut)
	ret0, _ := ret[0].(error)
	return ret0
}

// SaveSwapOut indicates an expected call of SaveSwapOut.
func (mr *MockRepositoryMockRecorder) SaveSwapOut(swapOut any) *gomock.Call {
	mr.mock.ctrl.T.Helper()
	return mr.mock.ctrl.RecordCallWithMethodType(mr.mock, "SaveSwapOut", reflect.TypeOf((*MockRepository)(nil).SaveSwapOut), swapOut)
}
