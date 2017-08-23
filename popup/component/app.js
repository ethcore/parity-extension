// Copyright 2015-2017 Parity Technologies (UK) Ltd.
// This file is part of Parity.

// Parity is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// Parity is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with Parity.  If not, see <http://www.gnu.org/licenses/>.

import classnames from 'classnames';
import { h, Component } from 'preact';

import 'material-design-lite/material.css';
import 'material-design-lite/material';

import Config, { DEFAULT_CONFIG } from '../../background/config';
import Extractions from './extractions';
import { getNodeStatus, getChainName, analytics, browser } from '../../shared';

import styles from './app.css';

export default class App extends Component {
  state = {
    augmentationEnabled: DEFAULT_CONFIG.augmentationEnabled,
    chainName: 'an unknown chain',
    extractions: [],
    status: ''
  };

  componentWillMount () {
    Config.get()
      .then((config) => {
        const { augmentationEnabled } = config;

        this.setState({ augmentationEnabled });
      });

    this.getExtractions();

    // Trigger when the pop-up is open
    window.onload = () => {
      this.getExtractions();
    };

    getNodeStatus()
      .then((status) => this.setState({ status }));

    getChainName()
      .then((chainName) => {
        if (!chainName) {
          return;
        }

        this.setState({ chainName });
      });
  }

  componentDidMount () {
    analytics({
      type: 'pageview',
      page: '/popup'
    });
  }

  getExtractions () {
    browser.runtime.sendMessage({ action: 'getExtractions' }, (extractions) => {
      this.setState({ extractions });
    });
  }

  render () {
    const { store } = this.props;
    const { augmentationEnabled, chainName, extractions, status } = this.state;

    return (
      <div className={ styles.container }>
        <div className={ styles.header }>
          <h1 className={ styles.title }>Parity Ethereum Integration</h1>
        </div>

        { this.renderHint(status) }
        { this.renderExtractions(augmentationEnabled, extractions, store) }
        { this.renderStatus(status, chainName) }
      </div>
    );
  }

  renderExtractions (augmentationEnabled, extractions, store) {
    if (!augmentationEnabled) {
      return null;
    }

    return (
      <Extractions
        extractions={ extractions }
        store={ store }
      />
    );
  }

  renderHint (status) {
    if (status === 'connected' || status === 'connecting') {
      return null;
    }

    return (
      <p className={ styles.error }>
        You are not connected to a local Parity Node. Seamless integration
        with the Ethereum network is thus not available.
      </p>
    );
  }

  renderStatus (status, chainName) {
    const iconClassName = classnames({
      [ styles.statusIcon ]: true,
      [ styles.connected ]: status === 'connected',
      [ styles.connecting ]: status === 'connecting',
      [ styles.disconnected ]: status === 'disconnected'
    });

    let phrase;
    let displayDownload = false;

    switch (status) {
      case 'connected':
        phrase = `Connected to ${chainName}`;
        break;

      case 'connecting':
        phrase = 'Connecting...';
        break;

      case 'disconnected':
      default:
        phrase = 'Not connected to a local node';
        displayDownload = true;
        break;
    }

    return (
      <div>
        { !displayDownload ? null : (
          <div className={ styles.getClient }>
            If you don't have an Ethereum Client yet <a
              href='https://parity.io/parity.html'
              target='_blank'
            >download Parity Ethereum</a>.
          </div>
        )}
        <div className={ styles.status }>
          <span className={ iconClassName } />
          <span>{ phrase }</span>
        </div>
      </div>
    );
  }
}
