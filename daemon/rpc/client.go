package rpc

import (
	"fmt"

	log "github.com/sirupsen/logrus"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

func NewConnection(host string, port uint32) *grpc.ClientConn {
	conn, err := grpc.NewClient(
		fmt.Sprintf("%s:%d", host, port),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		log.Fatalf("did not connect: %v", err)
	}

	return conn
}

func NewRPCClient(host string, port uint32) SwapServiceClient {
	conn := NewConnection(host, port)
	client := NewSwapServiceClient(conn)

	return client
}
