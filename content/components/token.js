// Copyright 2015, 2016 Parity Technologies (UK) Ltd.
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

import Badge from './badge';

import styles from './token.css';

export default class Token extends Component {
  render () {
    const { badge, balance, name, title } = this.props;
    const { size, src } = badge;

    const nameClass = classnames({
      [styles.tla]: true,
      [styles['no-value']]: !balance
    });

    return (
      <span
        className={ styles.token }
        title={ title }
      >
        <Badge
          size={ size }
          src={ src }
          title={ title }
        />

        <span className={ styles.balance }>
          { this.renderBalance(balance) }

          <span className={ nameClass }>
            { name }
          </span>
        </span>
      </span>
    );
  }

  renderBalance (balance) {
    if (!balance) {
      return null;
    }

    const value = formatNumber(parseFloat(balance));

    return (
      <span className={ styles.value }>
        { value }
      </span>
    );
  }
}

/**
 * Format the given number with commas and
 * 3 decimals
 */
function formatNumber (x) {
  return x.toFixed(3).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
