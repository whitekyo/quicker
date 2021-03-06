import { Constants } from '../utilities/constants';
import { EndpointType } from '../types/endpoint.type';
import { QuicError } from '../utilities/errors/connection.error';
import { ConnectionErrorCodes } from '../utilities/errors/quic.codes';
import { Version } from '../packet/header/header.properties';
import { HandshakeState } from './qtls';
import { Bignum } from '../types/bignum';


// hardcoded, in this order, at https://tools.ietf.org/html/draft-ietf-quic-transport#section-6.4.1
// TODO: section 6.4.4 mentions 3 more version negotation validation parameters, but doesn't explain this in detail... should add these though? 
// https://tools.ietf.org/html/draft-ietf-quic-transport#section-6.4.4
// code example in #6.4 adds these as uint32 before all the rest? still not very clear... 
// for more inspiration: https://github.com/NTAP/quant/blob/master/lib/src/tls.c#L400
// apparently, the whole <4..2^8-4> syntax is not well defined (asked Lars Eggert on slack) and subject to interpretation... *head desk*
export enum TransportParameterType {
    INITIAL_MAX_STREAM_DATA_BIDI_LOCAL = 0x00,  // max data we are willing to receive from our peer on streams that we ourselves opened
    INITIAL_MAX_DATA = 0x01,                    // max data in-flight for the full connection
    INITIAL_MAX_BIDI_STREAMS = 0x02,    // maximum amount of bi-directional streams that can be opened
    IDLE_TIMEOUT = 0x03,                // amount of seconds to wait before closing the connection if nothing is received
    PREFERRED_ADDRESS = 0x04,           // server address to switch to after completing handshake // UPDATE-12 TODO: actually use this in the implementation somewhere 
    MAX_PACKET_SIZE = 0x05,             // maximum total packet size (at UDP level)
    STATELESS_RESET_TOKEN = 0x06,       // token to be used in the case of a stateless reset 
    ACK_DELAY_EXPONENT = 0x07,          // congestion control tweaking parameter, see congestion/ack handling logic 
    INITIAL_MAX_UNI_STREAMS = 0x08,     // maximum amount of uni-directional streams that can be opened
    DISABLE_MIGRATION = 0x09,           // boolean to disable migration-related features
    INITIAL_MAX_STREAM_DATA_BIDI_REMOTE = 0x0a, // max data we are willing to receive from our peer on streams that they opened 
    INITIAL_MAX_STREAM_DATA_UNI = 0x0b, // max data we are willing to receive from our peer on streams that they opened 
    MAX_ACK_DELAY = 0x0c,               // maximum amount of MILLIseconds this endpoint will delay sending acks  
    ORIGINAL_CONNECTION_ID = 0x0d       // The original connection id from the INITIAL packet, only used when sending RETRY packet 
}

/**
 * The Transport parameters need to be flexible and also support unknown values (which we ignore afterwards)
 * Thus, this class uses generic get/set based on an enum to keep things flexible and easily parse-able
 */
export class TransportParameters {

    private isServer: boolean;

    private maxStreamDataBidiLocal: number;
    private maxStreamDataBidiRemote: number;
    private maxStreamDataUni: number;
    private maxData: number;
    private maxStreamIdBidi!: number;
    private maxStreamIdUni!: number;
    private idleTimeout: number;
    private maxPacketSize!: number;
    private statelessResetToken!: Buffer;
    private ackDelayExponent!: number;

    private disableMigration!: boolean;

    private version!: Version;

    public constructor(isServer: boolean, maxStreamData: number, maxData: number, idleTimeout: number, version: Version) {
        this.isServer = isServer;
        this.maxStreamDataBidiLocal = maxStreamData; // TODO: allow individual setting of these parameters if we do this via the ctor
        this.maxStreamDataBidiRemote = maxStreamData;
        this.maxStreamDataUni = maxStreamData;
        this.maxData = maxData;
        this.idleTimeout = idleTimeout;
        this.version = version;
    }

    // REFACTOR TODO: most of these values have a minimum and maximum allowed value: check for these here! 
    // see https://tools.ietf.org/html/draft-ietf-quic-transport#section-6.4.1
    public setTransportParameter(type: TransportParameterType, value: any): void {
        switch (type) {
            case TransportParameterType.INITIAL_MAX_STREAM_DATA_BIDI_LOCAL:
                this.maxStreamDataBidiLocal = value;
                break;
            case TransportParameterType.INITIAL_MAX_STREAM_DATA_BIDI_REMOTE:
                this.maxStreamDataBidiRemote = value;
                break;
            case TransportParameterType.INITIAL_MAX_STREAM_DATA_UNI:
                this.maxStreamDataUni = value;
                break;
            case TransportParameterType.INITIAL_MAX_DATA:
                this.maxData = value;
                break;
            case TransportParameterType.STATELESS_RESET_TOKEN:
                this.statelessResetToken = value;
                break;
            case TransportParameterType.IDLE_TIMEOUT:
                this.idleTimeout = value;
                break;
            case TransportParameterType.INITIAL_MAX_BIDI_STREAMS:
                this.maxStreamIdBidi = value;
                break;
            case TransportParameterType.INITIAL_MAX_UNI_STREAMS:
                this.maxStreamIdUni = value;
                break;
            case TransportParameterType.MAX_PACKET_SIZE:
                this.maxPacketSize = value;
                break;
            case TransportParameterType.ACK_DELAY_EXPONENT:
                this.ackDelayExponent = value;
                break;
            case TransportParameterType.DISABLE_MIGRATION:
                this.disableMigration = value;
                break;
        }
    }

    public getTransportParameter(type: TransportParameterType): any {
        switch (type) {
            case TransportParameterType.INITIAL_MAX_STREAM_DATA_BIDI_LOCAL:
                return this.maxStreamDataBidiLocal;
            case TransportParameterType.INITIAL_MAX_STREAM_DATA_BIDI_REMOTE:
                return this.maxStreamDataBidiRemote;
            case TransportParameterType.INITIAL_MAX_STREAM_DATA_UNI:
                return this.maxStreamDataUni;
            case TransportParameterType.INITIAL_MAX_DATA:
                return this.maxData;
            case TransportParameterType.STATELESS_RESET_TOKEN:
                return this.statelessResetToken;
            case TransportParameterType.IDLE_TIMEOUT:
                return this.idleTimeout;
            case TransportParameterType.INITIAL_MAX_BIDI_STREAMS:
                return this.maxStreamIdBidi;
            case TransportParameterType.INITIAL_MAX_UNI_STREAMS:
                return this.maxStreamIdUni;
            case TransportParameterType.MAX_PACKET_SIZE:
                return this.maxPacketSize === undefined ? Constants.MAX_PACKET_SIZE : this.maxPacketSize;
            case TransportParameterType.ACK_DELAY_EXPONENT:
                return this.ackDelayExponent === undefined ? Constants.DEFAULT_ACK_EXPONENT : this.ackDelayExponent;
            case TransportParameterType.DISABLE_MIGRATION:
                return this.disableMigration;
        }
        return undefined;
    }

    public getVersion(): Version {
        return this.version;
    }

    private getTransportParametersBuffer(): Buffer {
        var buffer = Buffer.alloc(this.getBufferSize());
        var offset = 0;
        var bufferOffset: BufferOffset = {
            buffer: buffer,
            offset: offset
        };
        bufferOffset = this.writeTransportParameter(TransportParameterType.INITIAL_MAX_STREAM_DATA_BIDI_LOCAL, bufferOffset, this.maxStreamDataBidiLocal);
        bufferOffset = this.writeTransportParameter(TransportParameterType.INITIAL_MAX_STREAM_DATA_BIDI_REMOTE, bufferOffset, this.maxStreamDataBidiRemote);
        bufferOffset = this.writeTransportParameter(TransportParameterType.INITIAL_MAX_STREAM_DATA_UNI, bufferOffset, this.maxStreamDataUni);
        bufferOffset = this.writeTransportParameter(TransportParameterType.INITIAL_MAX_DATA, bufferOffset, this.maxData);
        bufferOffset = this.writeTransportParameter(TransportParameterType.IDLE_TIMEOUT, bufferOffset, this.idleTimeout);
        if (this.isServer) {
            bufferOffset = this.writeTransportParameter(TransportParameterType.STATELESS_RESET_TOKEN, bufferOffset, this.statelessResetToken);
        }
        if (this.maxStreamIdBidi !== undefined) {
            bufferOffset = this.writeTransportParameter(TransportParameterType.INITIAL_MAX_BIDI_STREAMS, bufferOffset, this.maxStreamIdBidi);
        }
        if (this.maxStreamIdUni !== undefined) {
            bufferOffset = this.writeTransportParameter(TransportParameterType.INITIAL_MAX_UNI_STREAMS, bufferOffset, this.maxStreamIdUni);
        }
        if (this.maxPacketSize !== undefined) {
            bufferOffset = this.writeTransportParameter(TransportParameterType.MAX_PACKET_SIZE, bufferOffset, this.maxPacketSize);
        }
        if (this.ackDelayExponent !== undefined) {
            bufferOffset = this.writeTransportParameter(TransportParameterType.ACK_DELAY_EXPONENT, bufferOffset, this.ackDelayExponent);
        }
        if( this.disableMigration ){
            bufferOffset = this.writeZeroLengthTransportParameter(TransportParameterType.DISABLE_MIGRATION, bufferOffset);
        }
        return bufferOffset.buffer;
    }

    /**
     * Builds a buffer from the transport parameters AND the negotiated version
     *  --> Is the same buffer as the extensionDataBuffer, except that the first four bytes also contain the version
     *  this buffer is used to perform session resumption by the client
     *  function is thus used for application side
     */
    public toBuffer(): Buffer {
        var transportParameterersBuffer = this.getTransportParametersBuffer();
        var buf = Buffer.alloc(transportParameterersBuffer.byteLength + 4);
        buf.write(this.version.toString(), 0, 4, 'hex');
        transportParameterersBuffer.copy(buf, 4);
        return buf;
    }

    /**
     * Builds a buffer from the transport parameters and the necessary version parts which are mandatory 
     *      (initial version for the client| negotiated version + supported version for the server)
     *  this buffer is used to pass to C++ side to send it to the other endpoint
     *  function is thus used for internal use only.
     */
    public toExtensionDataBuffer(handshakeState: HandshakeState, version: Version): Buffer {
        var transportParamBuffer = this.getTransportParametersBuffer();
        var transportExt = Buffer.alloc(this.getExtensionDataSize(transportParamBuffer, handshakeState));
        var offset = 0;
        if (this.isServer) {
            // version in the connection holds the negotiated version
            transportExt.write(version.toString(), offset, 4, 'hex');
            offset += 4;
            transportExt.writeUInt8(Constants.SUPPORTED_VERSIONS.length * 4, offset++);
            Constants.SUPPORTED_VERSIONS.forEach((version: string) => {
                transportExt.write(version, offset, 4, 'hex');
                offset += 4;
            });
        } else {
            transportExt.write(version.toString(), offset, 4, 'hex');
            offset += 4;
        }
        transportExt.writeUInt16BE(transportParamBuffer.byteLength, offset);
        offset += 2;
        transportParamBuffer.copy(transportExt, offset);
        return transportExt;
    }

    private writeTypeAndLength(type: TransportParameterType, buffer: Buffer, offset: number, length: number): BufferOffset {
        buffer.writeUInt16BE(type, offset);
        offset += 2;
        buffer.writeUInt16BE(length, offset);
        offset += 2;
        return {
            buffer: buffer,
            offset: offset
        }
    }

    private writeTransportParameter(type: TransportParameterType, bufferOffset: BufferOffset, value: number): BufferOffset;
    private writeTransportParameter(type: TransportParameterType, bufferOffset: BufferOffset, value: Buffer): BufferOffset;
    private writeTransportParameter(type: TransportParameterType, bufferOffset: BufferOffset, value: any): BufferOffset {
        bufferOffset = this.writeTypeAndLength(type, bufferOffset.buffer, bufferOffset.offset, this.getTransportParameterTypeByteSize(type));
        if (value instanceof Buffer) {
            value.copy(bufferOffset.buffer, bufferOffset.offset);
        } else {
            bufferOffset.buffer.writeUIntBE(value, bufferOffset.offset, this.getTransportParameterTypeByteSize(type));
        }
        bufferOffset.offset += this.getTransportParameterTypeByteSize(type);
        return bufferOffset;
    }

    private writeZeroLengthTransportParameter(type: TransportParameterType, bufferOffset: BufferOffset){
        // zero-length = boolean : if the parameter is present, value is automatically 1, so length is 0
        bufferOffset = this.writeTypeAndLength(type, bufferOffset.buffer, bufferOffset.offset, 0);
        return bufferOffset;
    }

    private getBufferSize(): number {
        var size = 0;
        // max stream data parameters: 2 byte for type, 2 byte for length and 4 byte for value
        size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.INITIAL_MAX_STREAM_DATA_BIDI_LOCAL);
        size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.INITIAL_MAX_STREAM_DATA_BIDI_REMOTE);
        size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.INITIAL_MAX_STREAM_DATA_UNI);
        // max data: 2 byte for type, 2 byte for length and 4 byte for value
        size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.INITIAL_MAX_DATA);
        // idle timeout: 2 byte for type, 2 byte for length and 2 byte for value
        size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.IDLE_TIMEOUT);
        if (this.maxStreamIdBidi !== undefined) {
            // max stream id for bidirectional streams: 2 byte for type,2 byte for length and 2 byte for value
            size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.INITIAL_MAX_BIDI_STREAMS);
        }
        if (this.maxStreamIdUni !== undefined) {
            // max stream id for unidirectional streams: 2 byte for type,2 byte for length and 2 byte for value
            size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.INITIAL_MAX_UNI_STREAMS);
        }
        if (this.maxPacketSize !== undefined) {
            // max size for a packet: 2 byte for type, 2 byte for length and 2 byte for value
            size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.MAX_PACKET_SIZE);
        }
        if (this.ackDelayExponent !== undefined) {
            // ack delay exponent: 2 byte for type, 2 byte for length and 1 for the exponent
            size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.ACK_DELAY_EXPONENT);
        }
        if (this.isServer) {
            // stateless reset token: 2 byte for type, 2 byte for length and 16 byte for value
            size += 2 + 2 + this.getTransportParameterTypeByteSize(TransportParameterType.STATELESS_RESET_TOKEN);
        }
        if( this.disableMigration ){
            // disable migration: is a zero-length value, so: 2 byte for type, 2 byte for length (which is always 0) and that's it
            // means: if present, it's set, if left out, it's not set 
            size += 2 + 2; // this.getTransportParameterTypeByteSize(TransportParameterType.DISABLE_MIGRATION);
        }
        return size;
    }

    /**
     * Rebuild transport parameters from a buffer object which is obtained from the other endpoint and received from C++ side.
     *  function is for internal use.
     */
    public static fromExtensionBuffer(isServer: boolean, buffer: Buffer, version: Version): TransportParameters {
        var values: { [index: number]: any; } = [];
        var offset = 0;
        var transportParameters = new TransportParameters(isServer, 0, 0, 0, version);
        while (offset < buffer.byteLength) {
            var type = buffer.readUInt16BE(offset);
            offset += 2;
            var len = buffer.readUInt16BE(offset);
            offset += 2;
            var value = undefined;
            if (len > 4) {
                value = Buffer.alloc(len);
                buffer.copy(value, 0, offset, offset + len);
            } else if( len > 0 ) {
                value = buffer.readUIntBE(offset, len);
            }
            else{
                value = true; // 0-length transport parameters are booleans: if they're present, their value is true
            }
            offset += len;
            if (type in values) {
                throw new QuicError(ConnectionErrorCodes.TRANSPORT_PARAMETER_ERROR, "Dual transport parameter defined " + type);
            }
            values[type] = value;
        }
        for (let key in values) {
            // Ignore unknown transport parameters
            if (key in TransportParameterType) {
                transportParameters.setTransportParameter(Number(key), values[key]);
            } else {
            }
        }
        return transportParameters;
    }

    /**
     * Rebuild transport parameters from a buffer object (passed to the client).
     *  The first 4 bytes contain the negotiated version and the rest is the same as the extensionBuffer
     *  This function must be used for application 
     */
    public static fromBuffer(isServer: boolean, buffer: Buffer): TransportParameters {
        var version = new Version(Buffer.from(buffer.readUInt32BE(0).toString(16), 'hex'));
        var tpBuffer = buffer.slice(4);
        return TransportParameters.fromExtensionBuffer(isServer, tpBuffer, version);
    }

    private getTransportParameterTypeByteSize(type: TransportParameterType): number {
        switch (type) {
            case TransportParameterType.INITIAL_MAX_STREAM_DATA_BIDI_LOCAL:
            case TransportParameterType.INITIAL_MAX_STREAM_DATA_BIDI_REMOTE:
            case TransportParameterType.INITIAL_MAX_STREAM_DATA_UNI:
                return 4;
            case TransportParameterType.INITIAL_MAX_DATA:
                return 4;
            case TransportParameterType.INITIAL_MAX_BIDI_STREAMS:
                return 2;
            case TransportParameterType.IDLE_TIMEOUT:
                return 2;
            case TransportParameterType.PREFERRED_ADDRESS:
                return 4; // UPDATE-12 : draft doesn't specify how large this one can get... different for v4-v6... and a full struct... PITA
            case TransportParameterType.MAX_PACKET_SIZE:
                return 2;
            case TransportParameterType.STATELESS_RESET_TOKEN:
                return 16;
            case TransportParameterType.ACK_DELAY_EXPONENT:
                return 1;
            case TransportParameterType.INITIAL_MAX_UNI_STREAMS:
                return 2;
            case TransportParameterType.DISABLE_MIGRATION:
                return 0;
        }
        return 0;
    }

    /**
     * Method to get transport parameters with default values, which are set in the constants file
     * @param isServer 
     * @param version 
     */
    public static getDefaultTransportParameters(isServer: boolean, version: Version): TransportParameters {
        let transportParameters = new TransportParameters(isServer, Constants.DEFAULT_MAX_STREAM_DATA, Constants.DEFAULT_MAX_DATA, Constants.DEFAULT_IDLE_TIMEOUT, version);

        transportParameters.setTransportParameter(TransportParameterType.ACK_DELAY_EXPONENT, Constants.DEFAULT_ACK_EXPONENT);
        transportParameters.setTransportParameter(TransportParameterType.DISABLE_MIGRATION, Constants.DISABLE_MIGRATION);
        if (isServer) {
            transportParameters.setTransportParameter(TransportParameterType.INITIAL_MAX_BIDI_STREAMS, Constants.DEFAULT_MAX_STREAM_CLIENT_BIDI);
            transportParameters.setTransportParameter(TransportParameterType.INITIAL_MAX_UNI_STREAMS, Constants.DEFAULT_MAX_STREAM_CLIENT_UNI);
            // TODO: better to calculate this value
            transportParameters.setTransportParameter(TransportParameterType.STATELESS_RESET_TOKEN, Bignum.random('ffffffffffffffffffffffffffffffff', 16).toBuffer());
        } else {
            transportParameters.setTransportParameter(TransportParameterType.INITIAL_MAX_BIDI_STREAMS, Constants.DEFAULT_MAX_STREAM_SERVER_BIDI);
            transportParameters.setTransportParameter(TransportParameterType.INITIAL_MAX_UNI_STREAMS, Constants.DEFAULT_MAX_STREAM_SERVER_UNI);
        }
        return transportParameters;
    }

    /**
     * Calculate the size of the buffer which is passed to C++ for openssl
     */
    private getExtensionDataSize(transportParamBuffer: Buffer, handshakeState: HandshakeState): number {
        if (this.isServer) {
            if (handshakeState === HandshakeState.HANDSHAKE) {
                return transportParamBuffer.byteLength + 6 + Constants.SUPPORTED_VERSIONS.length * 4 + 1;
            }
            return transportParamBuffer.byteLength + 2;
        }
        return transportParamBuffer.byteLength + 6;
    }
}

export interface BufferOffset {
    buffer: Buffer,
    offset: number
}